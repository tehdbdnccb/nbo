//! Enterprise Business Rules
//! Zero I/O dependencies. Mathematical purity and strict boundary enforcement.

#[derive(Debug, Clone, PartialEq)]
pub enum DomainError {
    KebsAgeViolation(u32),
    InvalidInput(&'static str),
}

#[derive(Debug, Clone)]
pub struct ValuationResult {
    pub depreciated_crsp_kes: f64,
    pub total_duties_kes: f64,
    pub total_landed_kes: f64,
}

pub struct KraTaxCalculator;

impl KraTaxCalculator {
    /// Validates the KEBS 8-year age invariant.
    pub fn validate_age(manufacture_year: u32, current_year: u32) -> Result<u32, DomainError> {
        let age = current_year.saturating_sub(manufacture_year);
        if age > 8 || manufacture_year < 2019 {
            return Err(DomainError::KebsAgeViolation(manufacture_year));
        }
        Ok(age)
    }

    /// Computes exact Mombasa landed cost using current EAC CET brackets.
    pub fn compute_landed_cost(base_crsp: f64, age: u32, engine_cc: u32) -> ValuationResult {
        let dep_rate = match age {
            0 => 0.0, 1 => 0.05, 2 => 0.10, 3 => 0.15,
            4 => 0.20, 5 => 0.30, 6 => 0.40, 7 => 0.50, _ => 0.60,
        };
        
        let customs_val = base_crsp * (1.0 - dep_rate);
        let import_duty = customs_val * 0.35; // 35% EAC CET Passenger Vehicle Band
        
        // 35% excise for high-displacement (>3000cc), 25% standard.
        let excise_rate = if engine_cc >= 3000 { 0.35 } else { 0.25 };
        let excise_duty = (customs_val + import_duty) * excise_rate;
        
        let vat = (customs_val + import_duty + excise_duty) * 0.16;
        let levies = customs_val * 0.04; // IDF (2.5%) + RDL (1.5%)
        
        let total_duties = import_duty + excise_duty + vat + levies;

        ValuationResult {
            depreciated_crsp_kes: customs_val,
            total_duties_kes: total_duties,
            total_landed_kes: customs_val + total_duties,
        }
    }
}

#[derive(Debug, Clone)]
pub struct TelemetryMetrics {
    pub sea_level_whp: u32,
    pub nairobi_whp: u32,
    pub hardware_cost_kes: f64,
    pub kes_per_whp: f64,
}

pub struct NairobiAltitudeEngine;

impl NairobiAltitudeEngine {
    /// Computes the final project efficiency matrix (Cost per WHP)
    pub fn calculate_stage_telemetry(
        base_whp: u32,
        stage: u8,
        landed_vehicle_kes: f64,
    ) -> Result<TelemetryMetrics, DomainError> {
        let (gain_multiplier, hardware_cost_kes) = match stage {
            1 => (1.18, 95_000.0),   
            2 => (1.32, 340_000.0),  
            3 => (1.58, 1_150_000.0),
            _ => return Err(DomainError::InvalidInput("Stage must be 1, 2, or 3")),
        };

        let sea_level_whp = ((base_whp as f64) * gain_multiplier).round() as u32;
        let nairobi_whp = Self::apply_barometric_derating(sea_level_whp, stage);
        
        let total_project_kes = landed_vehicle_kes + hardware_cost_kes;
        let kes_per_whp = total_project_kes / (nairobi_whp as f64);

        Ok(TelemetryMetrics {
            sea_level_whp,
            nairobi_whp,
            hardware_cost_kes,
            kes_per_whp,
        })
    }

    /// Solves for thermodynamic loss at 1,795m ASL (81.4 kPa).
    fn apply_barometric_derating(sea_level_whp: u32, stage: u8) -> u32 {
        // Stage 3 hybrid turbos running water-methanol mitigate thermal limits 
        // better than standard Stage 1/2 compressor maps at high altitude.
        let retention_factor = if stage == 3 { 0.965 } else { 0.935 };
        ((sea_level_whp as f64) * retention_factor).round() as u32
    }
}