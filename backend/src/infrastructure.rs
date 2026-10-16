use std::pin::Pin;
use futures::{Stream, StreamExt};
use reqwest::Client;
use reqwest_eventsource::{Event, EventSource};
use serde_json::Value;
use crate::application::{AdvisoryStreamPort, CrspPort};
use crate::domain::DomainError;

pub struct LocalCrspRepository;

impl LocalCrspRepository {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait::async_trait]
impl CrspPort for LocalCrspRepository {
    async fn fetch_base_crsp(&self, model: &str) -> Result<f64, DomainError> {
        // High-speed static lookup simulating a Redis or PostgreSQL hit
        match model {
            "2020 Audi SQ5" => Ok(8_200_000.0),
            "2020 BMW X6 M Competition" => Ok(16_400_000.0),
            "2021 Porsche Cayenne Turbo GT" => Ok(18_500_000.0),
            "2019 Toyota Land Cruiser 200" => Ok(14_000_000.0),
            _ => Err(DomainError::InvalidInput("Unsupported vehicle model in current KRA matrix")),
        }
    }
}

pub struct GroqAdvisoryAdapter {
    client: Client,
    api_key: String,
}

impl GroqAdvisoryAdapter {
    pub fn new(api_key: String) -> Self {
        Self {
            client: Client::new(),
            api_key,
        }
    }
}

impl AdvisoryStreamPort for GroqAdvisoryAdapter {
    fn stream_advisory(
        &self,
        vehicle: &str,
        stage: u8,
        focus: &str,
    ) -> Pin<Box<dyn Stream<Item = Result<String, String>> + Send>> {
        let prompt = format!(
            "You are an elite Nairobi automotive performance engineer. The user is evaluating a Stage {} {}. Focus: {}. Stream 3 highly technical, strictly localized bullet points covering specific mechanical constraints at 1,795m altitude and Kenya's 95 RON fuel limits. Zero fluff. Max 100 words total.",
            stage, vehicle, focus
        );

        let body = serde_json::json!({
            "model": "llama-3.3-70b-versatile",
            "messages": [{"role": "user", "content": prompt}],
            "stream": true,
            "temperature": 0.2
        });

        let request = self.client
            .post("https://api.groq.com/openai/v1/chat/completions")
            .bearer_auth(&self.api_key)
            .json(&body);

        let mut event_source = EventSource::new(request).expect("Failed to initialize SSE adapter");

        let stream = async_stream::stream! {
            while let Some(event) = event_source.next().await {
                match event {
                    Ok(Event::Message(message)) => {
                        if message.data == "[DONE]" { break; }
                        if let Ok(json) = serde_json::from_str::<Value>(&message.data) {
                            if let Some(content) = json["choices"][0]["delta"]["content"].as_str() {
                                yield Ok(content.to_string());
                            }
                        }
                    }
                    Err(e) => yield Err(format!("Groq Upstream Failure: {}", e)),
                    _ => {}
                }
            }
        };

        Box::pin(stream)
    }
}