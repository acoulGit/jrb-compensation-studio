# Accès local et période initiale (Lot 2B-RC1-SEC1-A)

Ce document décrit le verrou applicatif local mis en place au Lot
2B-RC1-SEC1-A : mot de passe local, période de validité initiale de 10 mois
civils, et détection d’anomalie d’horloge système. L’activation d’une
licence (au-delà de la période initiale) est traitée par le Lot
2B-RC1-SEC1-B et n’est **pas** couverte ici.

## Objectifs

- Empêcher l’usage de l’application sans mot de passe local, dès le premier
  démarrage sur un poste donné.
- Limiter l’usage sans licence à une période initiale de 10 mois civils à
  compter de l’installation.
- Détecter une manipulation grossière de l’horloge système (recul de plus de
  24h) et bloquer l’application dans ce cas, de façon persistante (pas de
  récupération automatique).
- Ne jamais journaliser ni transmettre un secret (mot de passe, hachage) au
  frontend ou dans les journaux.

## Deux fenêtres Tauri strictement isolées

| Fenêtre | Rôle | Capacité | Précharge la base métier ? |
| --- | --- | --- | --- |
| `access` | Verrou local (configuration, déverrouillage, écrans de blocage) | `capabilities/access.json` : `core:default`, `allow-get-local-access-status`, `allow-setup-local-access`, `allow-unlock-local-access` | Non — jamais de `sql:*` |
| `main` | Application complète (campagnes, import, simulation, export…) | `capabilities/main.json` : `core:default`, `sql:*`, commandes métier, `allow-get-local-access-status`, `allow-change-local-password`, `allow-lock-local-access` | Oui, via le plugin `tauri-plugin-sql` |

Au démarrage, `tauri.conf.json` ne déclare que la fenêtre `access` (520×640,
non redimensionnable). La fenêtre `main` est créée par
`local_access::windows::ensure_main_window` uniquement après un
`setup_local_access` ou `unlock_local_access` réussi. `lock_local_access`
fait l’inverse (`show_access_hide_main`) : la fenêtre `main` est masquée, la
fenêtre `access` réaffichée, et la session mémoire reverrouillée.

Côté frontend, `src/main.tsx` choisit le composant racine à monter selon le
label de la fenêtre courante (`getCurrentWindow().label`) : `AccessApp` pour
`access`, `App` (application complète) pour `main`. `AccessApp` n’importe
**jamais** `AppDataProvider` ni `getDatabase` : voir
`src/tests/localAccessUi.test.tsx` (« ne déclenche aucun chargement de base
de données SQLite »).

## Session en mémoire

`AccessSessionState` (`src-tauri/src/local_access/state.rs`) est un état géré
par Tauri (`app.manage(...)`), non persisté : un simple booléen `unlocked`,
initialisé à `false` à chaque démarrage du processus. Redémarrer
l’application revient donc toujours à l’état verrouillé, quelle que soit la
persistance de la période de validité.

## Mot de passe local

- Hachage **Argon2id**, format PHC (`argon2` + `password-hash`), sel généré
  aléatoirement à chaque hachage (deux hachages du même mot de passe
  diffèrent toujours). Paramètres retenus : défauts sûrs du crate `argon2`
  0.5 — variante Argon2id, version 19, `m=19456` (19 MiB), `t=2`, `p=1`.
  Exemple de préfixe PHC : `$argon2id$v=19$m=19456,t=2,p=1$…`.
- Politique : 8 à 128 caractères, ni vide ni composé uniquement d’espaces
  (`trim().is_empty()` rejeté).
- Les mots de passe transitent côté Rust en `Zeroizing<String>` : effacés de
  la mémoire dès qu’ils sortent de portée.
- Côté frontend, les champs de mot de passe sont systématiquement vidés
  après une tentative (réussie ou refusée) — configuration initiale,
  déverrouillage, changement de mot de passe.
- Aucun mot de passe ni hachage n’est jamais renvoyé au frontend ni
  journalisé ; seul un code technique stable (`LocalAccessError::code()`)
  est loggé en build debug.

## Identifiant d’installation

Généré à la configuration initiale : `JRB-CS-{8hex}-{8hex}` (deux blocs
hexadécimaux de 8 caractères tirés d’un générateur cryptographique). Stocké
en clair (non secret) dans `local_access_state.installation_id`, exposé au
frontend via `LocalAccessStatusDto` pour affichage/diagnostic — jamais utilisé
comme secret.

## Période de validité initiale

- Calculée à la configuration initiale : `current_valid_until = installed_at
  + 10 mois civils`, calée sur le dernier jour du mois cible lorsque le jour
  d’origine n’existe pas (ex. 31 janvier + 1 mois → 28 ou 29 février).
- La période reste valide tant que `now <= current_valid_until` (borne
  inclusive) ; expirée strictement après.
- `initial_valid_until` est conservé séparément de `current_valid_until`
  (jamais réécrit) : il servira de référence lors de l’activation d’une
  licence (Lot 2B-RC1-SEC1-B).

## Détection d’anomalie d’horloge

- Toute évaluation (statut, déverrouillage, garde métier) compare l’horloge
  système courante à `last_observed_at`, la dernière observation persistée.
- Si `now < last_observed_at - 24h`, une anomalie est déclenchée et
  persistée (`clock_anomaly_detected = 1`) : l’application se bloque et
  **aucune récupération automatique** n’est possible (l’anomalie reste
  bloquante même si l’horloge redevient plausible ensuite).
- Sinon, `last_observed_at` **ne recule jamais** : il n’est avancé que si
  `now` est strictement postérieur à la valeur persistée.
- Une anomalie déjà détectée bloque aussi bien l’écran d’accès (`access`) que
  toute commande métier protégée par la garde (voir ci-dessous).

## Garde métier : `require_unlocked_and_licensed`

Toute commande métier existante appelle cette garde en première ligne :

- `replace_current_population`
- `archive_campaign`, `restore_campaign`, `activate_campaign`
- `save_simulation_run`
- `export_simulation_run_excel`, `generate_hr_export_password`

Ordre de vérification :

1. Session en mémoire déverrouillée (sinon message de verrou) ;
2. Horloge système non anormale (sinon message d’anomalie, bloquant) ;
3. Période de validité non expirée (sinon message de licence expirée).

Messages français stables (jamais de secret ni de détail SQL) :

| Cas | Message |
| --- | --- |
| Session verrouillée | « L’application est verrouillée. Veuillez saisir votre mot de passe. » |
| Licence expirée | « Le droit d’utilisation de l’application a expiré. Une licence est requise. » |
| Anomalie d’horloge | « La date système semble avoir été modifiée. Vérifiez l’horloge ou contactez JRB XSolutions. » |

## Persistance sans dépendre du plugin SQL

La fenêtre `access` ne précharge jamais la base via `tauri-plugin-sql`. Les
commandes d’accès local (`get_local_access_status`, `setup_local_access`,
`unlock_local_access`) doivent donc pouvoir lire/écrire `local_access_state`
avant que le plugin n’ait joué les migrations. Elles ouvrent une connexion
SQLite dédiée (`sqlx`, `create_if_missing(true)`) et rejouent la migration
`0010` de façon idempotente (`CREATE TABLE IF NOT EXISTS`) avant toute
opération — voir `src-tauri/src/local_access/store.rs`. La fenêtre `main`
continue de charger les migrations `0001`–`0010` via le plugin, comme les
autres tables métier.

## Commandes Tauri

| Commande | Entrée | Description |
| --- | --- | --- |
| `get_local_access_status` | — | Statut courant, sans secret — `access` et `main`. |
| `setup_local_access` | `{ password, passwordConfirmation }` | Label `access` uniquement ; échoue si déjà configuré. |
| `unlock_local_access` | `{ password }` | Label `access` uniquement ; vérifie aussi horloge et période. |
| `change_local_password` | `{ oldPassword, newPassword, newPasswordConfirmation }` | Label `main` + session déverrouillée + permission dédiée. |
| `lock_local_access` | — | Label `main` uniquement ; verrouille et bascule vers `access`. |

Une erreur `INVALID_ACCESS_WINDOW` (« Cette action n’est pas autorisée depuis
cette fenêtre. ») est renvoyée si le label Rust ne correspond pas, avant toute
lecture ou écriture de mot de passe.

## Interface utilisateur

- `src/access/AccessApp.tsx` : écrans configuration, déverrouillage,
  expiration, anomalie d’horloge — en français, sans dépendance à la base
  métier.
- Section « Sécurité » de la page Paramètres (`src/pages/SettingsPage.tsx`) :
  changement de mot de passe et verrouillage manuel, accessibles une fois
  l’application déverrouillée.

## Hors périmètre (versions ultérieures)

- Rotation de clé sans nouvelle version applicative.
- Portail d’émission en ligne (volontairement absent).

Les licences hors ligne sont documentées dans `docs/OFFLINE_LICENSES.md`
(Lot 2B-RC1-SEC1-B).
