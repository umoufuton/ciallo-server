ALTER TABLE pireps
ADD COLUMN IF NOT EXISTS aircraft_registration VARCHAR(32),
ADD COLUMN IF NOT EXISTS aircraft_type_code VARCHAR(64);

UPDATE pireps
SET
  aircraft_registration = COALESCE(
    aircraft_registration,
    NULLIF(BTRIM(raw_payload #>> '{data,aircraft,registration}'), ''),
    NULLIF(BTRIM(raw_payload #>> '{aircraft,registration}'), ''),
    NULLIF(BTRIM(raw_payload #>> '{data,registration}'), ''),
    NULLIF(BTRIM(raw_payload ->> 'registration'), ''),
    NULLIF(BTRIM(raw_payload #>> '{data,tail_number}'), ''),
    NULLIF(BTRIM(raw_payload ->> 'tail_number'), '')
  ),
  aircraft_type_code = COALESCE(
    aircraft_type_code,
    NULLIF(BTRIM(raw_payload #>> '{data,aircraft,icao}'), ''),
    NULLIF(BTRIM(raw_payload #>> '{aircraft,icao}'), ''),
    NULLIF(BTRIM(raw_payload #>> '{data,aircraft,icao_code}'), ''),
    NULLIF(BTRIM(raw_payload #>> '{aircraft,icao_code}'), ''),
    NULLIF(BTRIM(raw_payload #>> '{data,aircraft_type}'), ''),
    NULLIF(BTRIM(raw_payload ->> 'aircraft_type'), ''),
    NULLIF(BTRIM(raw_payload #>> '{data,environment,aircraft_type}'), ''),
    NULLIF(BTRIM(raw_payload #>> '{environment,aircraft_type}'), ''),
    NULLIF(BTRIM(raw_payload #>> '{data,environment,aircraft_title}'), ''),
    NULLIF(BTRIM(raw_payload #>> '{environment,aircraft_title}'), ''),
    NULLIF(BTRIM(type), '')
  )
WHERE aircraft_registration IS NULL
   OR aircraft_type_code IS NULL;

CREATE INDEX IF NOT EXISTS idx_pireps_pilot_sort_time
ON pireps (pilot_id, (COALESCE(on_blocks_time, source_created_at, created_at)) DESC, id DESC);
