pub mod api;
pub mod application;
pub mod domain;
pub mod infrastructure;

use axum::Router;
use std::sync::Arc;
use tokio::net::TcpListener;
use tower_http::{
    cors::{Any, CorsLayer},
    trace::TraceLayer,
};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() {
    // 1. Initialize Deterministic Telemetry
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "info,nairobi_tuning_engine=debug".into()),
        ))
        .with(tracing_subscriber::fmt::layer())
        .init();

    tracing::info!("Bootstrapping Nairobi Auto-Tuning Engine...");

    // 2. Wire Dependency Injection (Infrastructure -> Application)
    // In production, Groq API key and DB pools are instantiated here.
    let _advisory_port = infrastructure::GroqAdvisoryAdapter::new(
        std::env::var("GROQ_API_KEY").expect("GROQ_API_KEY environment variable missing"),
    );
    let _simulation_use_case = application::SimulationUseCase::new(); // Mapped in application.rs

    let app_state = api::AppState {
        // AppState population omitted for brevity; wires the Arc<UseCases> into Axum
    };

    // 3. Configure Strict Edge Security & CORS
    let cors = CorsLayer::new()
        .allow_origin(Any) // Vercel edge proxy rewrites mask the origin in production
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .merge(api::build_router(app_state)) // Router defined in api.rs
        .layer(TraceLayer::new_for_http())
        .layer(cors);

    // 4. Bind TCP Socket
    let port = std::env::var("PORT").unwrap_or_else(|_| "8000".to_string());
    let addr = format!("0.0.0.0:{}", port);
    let listener = TcpListener::bind(&addr).await.expect("Failed to bind TCP listener");

    tracing::info!("Core engine active and listening on {}", listener.local_addr().unwrap());
    
    axum::serve(listener, app)
        .await
        .expect("Fatal Axum server crash");
}