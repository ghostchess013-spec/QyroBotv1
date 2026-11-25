//! CLI verification gate: `cargo run -p qyro-router --bin verify-rtk`

use qyro_router::{LOCKED_ID_NEGATIONS, compress_indonesian_caveman, validate_cloud_endpoint};

fn main() {
    let blocked = [
        "UNSET",
        "http://localhost:11434/v1",
        "http://127.0.0.1:1234/v1",
        "http://[::1]:8080/v1",
        "https://192.168.1.5:11434/v1",
    ];
    for ep in blocked {
        assert!(
            validate_cloud_endpoint(ep).is_err(),
            "Expected local/UNSET endpoint to be rejected: {ep}"
        );
    }
    assert!(validate_cloud_endpoint("https://api.groq.com/openai/v1").is_ok());

    let sample = "Mohon dicatat bahwa sebenarnya sistem ini tidak boleh memakai model lokal, jangan pernah kirim secret, bukan publik, belum siap kecuali HTTPS, hanya free tier, wajib aktif, dan dilarang bocor.";
    let compressed = compress_indonesian_caveman(sample);
    for neg in LOCKED_ID_NEGATIONS {
        if sample.contains(neg) {
            assert!(
                compressed.to_ascii_lowercase().contains(neg),
                "Negation word lost: {neg}"
            );
        }
    }
    println!("verify-rtk PASSED (Anti-Local Guard + Indonesian Caveman Language Guard verified)");
}
