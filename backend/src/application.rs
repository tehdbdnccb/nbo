use std::pin::Pin;
use std::sync::Arc;
use futures::stream::Stream;
use serde::{Deserialize, Serialize};
use crate::domain::{DomainError, KraTaxCalculator, NairobiAltitudeEngine};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HotspotBlueprint {
    pub stage: u8,
    pub x_percent: u8,
    pub y_percent: u8,
    pub subsystem: String,
    pub hardware_spec: String,
    pub default_focus: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VehicleBlueprint {
    pub canonical_model: String,
    pub engine_code: String,
    pub displacement_cc: u32,
    pub cylinders: u8,
    pub base_whp: u32,
    pub base_crsp_kes: f64,
    pub image_url: String,
    pub hotspots: Vec<HotspotBlueprint>,
}

pub struct SimulationResult {
    pub blueprint: VehicleBlueprint,
    pub landed_vehicle_kes: f64,
    pub duties_kes: f64,
    pub hardware_kes: f64,
    pub sea_level_whp: u32,
    pub nairobi_whp: u32,
    pub kes_per_whp: f64,
}

pub trait VehicleDiscoveryPort: Send + Sync {
    fn discover_vehicle<'a>(
        &'a self,
        query: &'a str,
        year: u32,
    ) -> Pin<Box<dyn std::future::Future<Output = Result<VehicleBlueprint, DomainError>> + Send + 'a>>;
}

pub trait AdvisoryStreamPort: Send + Sync {
    fn stream_advisory(
        &self,
        vehicle: &str,
        stage: u8,
        focus: &str,
    ) -> Pin<Box<dyn Stream<Item = Result<String, String>> + Send>>;
}

pub struct SimulationUseCase {
    discovery_port: Arc<dyn VehicleDiscoveryPort>,
}

impl SimulationUseCase {
    pub fn new(discovery_port: Arc<dyn VehicleDiscoveryPort>) -> Self {
        Self { discovery_port }
    }

    pub async fn execute(
        &self,
        query: &str,
        year: u32,
        stage: u8,
    ) -> Result<SimulationResult, DomainError> {
        let age = KraTaxCalculator::validate_age(year, 2026)?;
        let blueprint = self.discovery_port.discover_vehicle(query, year).await?;

        let valuation = KraTaxCalculator::compute_landed_cost(
            blueprint.base_crsp_kes,
            age,
            blueprint.displacement_cc,
        );

        let telemetry = NairobiAltitudeEngine::calculate_stage_telemetry(
            blueprint.base_whp,
            stage,
            valuation.total_landed_kes,
        )?;

        Ok(SimulationResult {
            blueprint,
            landed_vehicle_kes: valuation.total_landed_kes,
            duties_kes: valuation.total_duties_kes,
            hardware_kes: telemetry.hardware_cost_kes,
            sea_level_whp: telemetry.sea_level_whp,
            nairobi_whp: telemetry.nairobi_whp,
            kes_per_whp: telemetry.kes_per_whp,
        })
    }
}