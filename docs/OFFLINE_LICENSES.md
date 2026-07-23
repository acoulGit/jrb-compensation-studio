# Licences hors ligne (Lot 2B-RC1-SEC1-B)

Ce document décrit l’émission et l’activation de licences signées Ed25519 pour
JRB Compensation Studio. Aucun serveur ni réseau n’est requis.

## Principe

Après la période initiale de 10 mois (SEC1-A), ou en renouvellement anticipé,
l’opérateur JRB XSolutions émet un code lié à l’`installationId` du poste.
L’application vérifie la signature avec une **clé publique embarquée**, puis
prolonge `current_valid_until`.

## Format du code

```
JRB1.<payload_base64url>.<signature_base64url>
```

Sans padding Base64. Le payload JSON signé contient au minimum :

```json
{
  "v": 1,
  "appId": "com.jrbxsolutions.compensationstudio",
  "installationId": "JRB-CS-XXXXXXXX-XXXXXXXX",
  "licenseId": "LIC-YYYYMMDD-XXXXXXXX",
  "issuedAt": "2026-07-23T12:00:00Z",
  "durationMonths": 12,
  "customer": "Nom facultatif"
}
```

La signature porte sur les **octets JSON exacts** produits à l’émission.

## Génération des clés

Outil séparé (hors bundle client) :

```powershell
cargo run --manifest-path tools/license-generator/Cargo.toml -- keygen `
  --private-key "D:\secure\jrb-compensation-license\private-key.txt" `
  --public-key "D:\secure\jrb-compensation-license\public-key.txt"
```

Règles :

- aléa cryptographique ;
- refus d’écrasement d’un fichier existant ;
- la clé privée n’est **jamais** affichée dans la console ;
- seule la clé publique est copiée dans
  `src-tauri/license/license_public_key.b64` puis embarquée au build.

### Sauvegarde impérative de la clé privée

Si la clé privée est perdue, **aucune nouvelle licence ne peut être émise**
pour les installations déjà déployées avec la clé publique correspondante.
Conserver une copie hors ligne en lieu sûr (coffre, support chiffré). Ne
jamais committer la clé privée dans Git.

### Rotation

Changer de clé privée exige une **nouvelle version** de l’application
embarquant la nouvelle clé publique. Les codes signés avec l’ancienne clé
ne seront plus acceptés.

## Émission d’un code

```powershell
cargo run --manifest-path tools/license-generator/Cargo.toml -- issue `
  --private-key "D:\secure\jrb-compensation-license\private-key.txt" `
  --installation-id "JRB-CS-12345678-ABCDEF12" `
  --months 12 `
  --customer "Client A"
```

Durée autorisée : **1 à 120 mois** inclus. Le `licenseId` est unique et ne
peut être réactivé.

## Inspection

```powershell
cargo run --manifest-path tools/license-generator/Cargo.toml -- inspect `
  --code "JRB1...." `
  --public-key "D:\secure\jrb-compensation-license\public-key.txt"
```

Sans `--public-key`, le payload est affiché sans affirmation de validité de
signature.

## Activation dans l’application

### Depuis la fenêtre `access`

Disponible lorsque la période est **expirée** ou qu’une **anomalie d’horloge**
bloque l’accès. Après succès :

- `current_valid_until` est prolongé ;
- `clock_anomaly_detected` est remis à 0 ;
- la session reste **verrouillée** ;
- la fenêtre `main` n’est **pas** ouverte ;
- l’utilisateur doit saisir son mot de passe.

### Depuis la fenêtre `main` (Paramètres → Licence)

Renouvellement anticipé si la session est déverrouillée. La session reste
ouverte après succès.

### Formule de renouvellement

```
base_date = max(current_valid_until, activation_date)
new_valid_until = base_date + durationMonths (mois civils)
```

Même fonction d’ajout de mois que SEC1-A (calage en fin de mois si besoin).
Valide tant que `now <= current_valid_until`.

## Historique

Chaque activation est enregistrée dans `license_activations` (migration
`0011`) : `license_id` unique, payload JSON, SHA-256 du payload, dates,
durée, client facultatif.

## Limites de sécurité

Protection commerciale locale dissuasive. Elle ne résiste pas à la
modification du binaire, à la suppression de la base ou à une restauration
avancée. Elle empêche l’usage normal après expiration sans code signé par
JRB XSolutions.

## Crate partagée

`crates/jrb-license-core` : format, payload, vérification — **aucun secret**.
