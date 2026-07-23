//! Générateur hors ligne de licences JRB Compensation Studio.
//!
//! Cet outil n’est **jamais** inclus dans le bundle Tauri client.
//! La clé privée ne doit jamais être affichée dans la console.

mod commands;
mod keys;

use clap::{Parser, Subcommand};

#[derive(Debug, Parser)]
#[command(
    name = "jrb-license-generator",
    about = "Générateur hors ligne de licences JRB Compensation Studio"
)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Debug, Subcommand)]
enum Commands {
    /// Génère une paire de clés Ed25519 (refuse d’écraser des fichiers existants).
    Keygen {
        #[arg(long)]
        private_key: String,
        #[arg(long)]
        public_key: String,
    },
    /// Émet un code de licence signé pour une installation.
    Issue {
        #[arg(long)]
        private_key: String,
        #[arg(long)]
        installation_id: String,
        #[arg(long)]
        months: u32,
        #[arg(long)]
        customer: Option<String>,
    },
    /// Affiche le payload décodé (vérifie la signature si --public-key est fourni).
    Inspect {
        #[arg(long)]
        code: String,
        #[arg(long)]
        public_key: Option<String>,
    },
}

fn main() {
    let cli = Cli::parse();
    let result = match cli.command {
        Commands::Keygen {
            private_key,
            public_key,
        } => commands::keygen(&private_key, &public_key),
        Commands::Issue {
            private_key,
            installation_id,
            months,
            customer,
        } => commands::issue(&private_key, &installation_id, months, customer.as_deref()),
        Commands::Inspect { code, public_key } => commands::inspect(&code, public_key.as_deref()),
    };
    if let Err(message) = result {
        eprintln!("{message}");
        std::process::exit(1);
    }
}
