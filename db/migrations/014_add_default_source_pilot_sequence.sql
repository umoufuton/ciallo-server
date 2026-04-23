CREATE SEQUENCE IF NOT EXISTS local_source_pilot_id_seq
  START WITH 900000000000
  INCREMENT BY 1
  MINVALUE 1
  NO MAXVALUE
  CACHE 1;

ALTER TABLE pilots
  ALTER COLUMN source_pilot_id SET DEFAULT nextval('local_source_pilot_id_seq');
