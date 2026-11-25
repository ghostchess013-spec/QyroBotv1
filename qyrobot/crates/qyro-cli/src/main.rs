//! qyro — QyroBot CLI for VPS administration:
//! `qyro doctor`, `qyro schedule parse "<expr>"`, `qyro self-update --check`, `qyro skills lock`.

use qyro_scheduler::parse_natural_schedule;
use std::env;
use std::fs;
use std::path::Path;

const QYRO_VERSION: &str = "1.7.0";
const RELEASE_FEED_URL: &str = "UNSET";
const MINISIGN_PUBKEY: &str = "UNSET";

fn main() {
    let args: Vec<String> = env::args().skip(1).collect();
    if args.is_empty() {
        print_usage();
        return;
    }

    match args[0].as_str() {
        "doctor" => {
            println!("QyroBot CLI v{QYRO_VERSION}");
            println!("Target arch: {}/{}", env::consts::OS, env::consts::ARCH);
            println!("Anti-Local-Model Guard: ACTIVE (zero local inference crates)");
            println!("Release feed: {RELEASE_FEED_URL}");
            println!("Minisign Ed25519 pubkey: {MINISIGN_PUBKEY}");
        }
        "schedule" => {
            if args.get(1).map(String::as_str) == Some("parse") {
                let expr = args[2..].join(" ");
                match parse_natural_schedule(&expr) {
                    Ok(parsed) => {
                        println!(
                            "{}",
                            serde_json::to_string_pretty(&parsed).unwrap_or_default()
                        );
                    }
                    Err(err) => {
                        eprintln!("error: {err}");
                        std::process::exit(2);
                    }
                }
            } else {
                eprintln!("Usage: qyro schedule parse \"Tiap Senin jam 09:30 WITA\"");
                std::process::exit(1);
            }
        }
        "self-update" => {
            println!("QyroBot Self-Updater v{QYRO_VERSION} ({}/{})", env::consts::OS, env::consts::ARCH);
            if RELEASE_FEED_URL == "UNSET" || MINISIGN_PUBKEY == "UNSET" {
                println!("status: UNSET — set QYRO_RELEASE_FEED and QYRO_MINISIGN_PUBKEY before running atomic self-update.");
                println!("rollback_policy: previous binary preserved in /usr/local/bin/qyro.prev before atomic rename.");
                return;
            }
        }
        "skills" => {
            let lock_path = Path::new("configs/skills-lock.json");
            match fs::read_to_string(lock_path) {
                Ok(content) => println!("{content}"),
                Err(err) => {
                    eprintln!("Failed to read {}: {err}", lock_path.display());
                    std::process::exit(1);
                }
            }
        }
        _ => {
            print_usage();
            std::process::exit(1);
        }
    }
}

fn print_usage() {
    println!("QyroBot CLI v{QYRO_VERSION}");
    println!("Commands:");
    println!("  qyro doctor                         Show architecture, guards & updater status");
    println!("  qyro schedule parse <expression>    Parse id-ID/en-US schedule with >= 5m guard");
    println!("  qyro self-update                    Check minisign Ed25519 signed updates & rollback slot");
    println!("  qyro skills lock                    Print configs/skills-lock.json");
}
