use std::pin::Pin;
use std::sync::Arc;
use futures::stream::Stream;
use crate::domain::{DomainError, KraTaxCalculator, NairobiAltitudeEngine};

/// Output structure decoupled from HTTP DTOs
pub struct SimulationResult {
    pub landed_vehicle_kes: f64,
    pub duties_kes: f64,
    pub hardware_kes: f64,
    pub sea_level_whp: u32,
    pub nairobi_whp: u32,
    pub kes_per_whp: f64,
}

/// Port: Data fetching contract
#[async_trait::async_trait]
pub trait CrspPort: Send + Sync {
    async fn fetch_base_crsp(&self, model: &str) -> Result<f64, DomainError>;
}

/// Port: LLM Streaming contract
pub trait AdvisoryStreamPort: Send + Sync {
    fn stream_advisory(
        &self,
        vehicle: &str,
        stage: u8,
        focus: &str,
    ) -> Pin<Box<dyn Stream<Item = Result<String, String>> + Send>>;
}

/// Orchestrates the KRA and Altitude domain models
pub struct SimulationUseCase {
    crsp_repo: Arc<dyn CrspPort>,
}

impl SimulationUseCase {
    pub fn new(crsp_repo: Arc<dyn CrspPort>) -> Self {
        Self { crsp_repo }
    }

    pub async fn execute(
        &self,
        model: &str,
        year: u32,
        cc: u32,
        stage: u8,
    ) -> Result<SimulationResult, DomainError> {
        // 1. Enforce Domain Invariant
        let age = KraTaxCalculator::validate_age(year, 2026)?;

        // 2. Fetch Base CRSP
        let base_crsp = self.crsp_repo.fetch_base_crsp(model).await?;

        // 3. Execute Pure Math
        let valuation = KraTaxCalculator::compute_landed_cost(base_crsp, age, cc);
        let telemetry = NairobiAltitudeEngine::calculate_stage_telemetry(
            450, // Base HP mocked for demonstration; in production, fetch from DB
            stage,
            valuation.total_landed_kes,
        )?;

        Ok(SimulationResult {
            landed_vehicle_kes: valuation.total_landed_kes,
            duties_kes: valuation.total_duties_kes,
            hardware_kes: telemetry.hardware_cost_kes,
            sea_level_whp: telemetry.sea_level_whp,
            nairobi_whp: telemetry.nairobi_whp,
            kes_per_whp: telemetry.kes_per_whp,
        })
    }
}