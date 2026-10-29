BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$ BEGIN CREATE TYPE proposal_status AS ENUM ('drafting','pending_approval','dispatching','dispatched','rejected','stale_aborted','failed','dispatch_unknown'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS prospects (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_domain text NOT NULL UNIQUE,
 company_name text, contact_name text, contact_role text, contact_email text, contact_source text,
 lawful_basis_note text, suppressed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (company_domain=lower(company_domain)), CHECK (company_domain !~ '^https?://')
);
CREATE TABLE IF NOT EXISTS sprint_proposals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), prospect_id uuid REFERENCES prospects(id) ON DELETE SET NULL,
 github_issue_url text NOT NULL UNIQUE, github_repo_full_name text NOT NULL,
 github_issue_number bigint NOT NULL CHECK (github_issue_number>0), issue_title text NOT NULL,
 issue_state text NOT NULL CHECK (issue_state IN ('open','closed')), issue_updated_at timestamptz,
 verified_evidence jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(verified_evidence)='array'),
 proposal_subject text, proposal_body text, status proposal_status NOT NULL DEFAULT 'drafting',
 generation_model text, validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(validation_errors)='array'),
 attempts integer NOT NULL DEFAULT 0 CHECK (attempts>=0), approved_by text, approved_at timestamptz,
 rejected_by text, rejected_at timestamptz, dispatched_at timestamptz, dispatch_message_id text,
 dispatch_started_at timestamptz, dispatch_error_code text, dispatch_error_detail text,
 approval_token_digest text, approval_token_action text CHECK (approval_token_action IN ('approve','reject')),
 approval_token_expires_at timestamptz, approval_token_used_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (status<>'pending_approval' OR (proposal_subject IS NOT NULL AND proposal_body IS NOT NULL)),
 CHECK (status<>'dispatched' OR (dispatched_at IS NOT NULL AND dispatch_message_id IS NOT NULL)),
 CHECK (status<>'dispatch_unknown' OR dispatch_message_id IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS proposal_events (
 id bigserial PRIMARY KEY, proposal_id uuid NOT NULL REFERENCES sprint_proposals(id) ON DELETE RESTRICT,
 event_type text NOT NULL, actor text NOT NULL, event_detail jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS proposal_events_proposal_created_idx ON proposal_events(proposal_id,created_at DESC);
CREATE TABLE IF NOT EXISTS dispatch_daily_counts (
 dispatch_date date PRIMARY KEY, count integer NOT NULL DEFAULT 0 CHECK (count>=0),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS dispatch_attempts (
 id bigserial PRIMARY KEY, proposal_id uuid NOT NULL REFERENCES sprint_proposals(id) ON DELETE RESTRICT,
 message_id text NOT NULL UNIQUE,
 outcome text NOT NULL CHECK (outcome IN ('prepared','accepted','rejected','unknown','reconciled_sent','reconciled_not_sent')),
 smtp_response_code text, smtp_response_detail text, started_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz, reconciled_by text, reconciliation_note text
);
CREATE INDEX IF NOT EXISTS dispatch_attempts_proposal_idx ON dispatch_attempts(proposal_id,started_at DESC);
CREATE INDEX IF NOT EXISTS sprint_proposals_status_created_idx ON sprint_proposals(status,created_at DESC);
CREATE INDEX IF NOT EXISTS sprint_proposals_unknown_idx ON sprint_proposals(updated_at) WHERE status IN ('dispatching','dispatch_unknown');
CREATE OR REPLACE FUNCTION degen_set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at=now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS prospects_set_updated_at ON prospects;
CREATE TRIGGER prospects_set_updated_at BEFORE UPDATE ON prospects FOR EACH ROW EXECUTE FUNCTION degen_set_updated_at();
DROP TRIGGER IF EXISTS sprint_proposals_set_updated_at ON sprint_proposals;
CREATE TRIGGER sprint_proposals_set_updated_at BEFORE UPDATE ON sprint_proposals FOR EACH ROW EXECUTE FUNCTION degen_set_updated_at();
CREATE OR REPLACE FUNCTION degen_reject_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'proposal_events is append-only'; END $$;
DROP TRIGGER IF EXISTS proposal_events_no_update ON proposal_events;
CREATE TRIGGER proposal_events_no_update BEFORE UPDATE OR DELETE ON proposal_events FOR EACH ROW EXECUTE FUNCTION degen_reject_event_mutation();
CREATE OR REPLACE FUNCTION degen_record_proposal_event(p_proposal_id uuid,p_event_type text,p_actor text,p_detail jsonb DEFAULT '{}'::jsonb)
RETURNS bigint LANGUAGE plpgsql AS $$ DECLARE v_id bigint; BEGIN
 INSERT INTO proposal_events(proposal_id,event_type,actor,event_detail) VALUES(p_proposal_id,p_event_type,p_actor,COALESCE(p_detail,'{}'::jsonb)) RETURNING id INTO v_id; RETURN v_id;
END $$;
CREATE OR REPLACE FUNCTION degen_claim_for_dispatch(p_proposal_id uuid,p_token_digest text,p_reviewer text)
RETURNS boolean LANGUAGE plpgsql AS $$ DECLARE v_id uuid; BEGIN
 UPDATE sprint_proposals SET status='dispatching',approved_by=p_reviewer,approved_at=now(),
 approval_token_used_at=now(),dispatch_started_at=now(),attempts=attempts+1
 WHERE id=p_proposal_id AND status='pending_approval' AND approval_token_action='approve'
 AND approval_token_digest=p_token_digest AND approval_token_used_at IS NULL AND approval_token_expires_at>now()
 RETURNING id INTO v_id;
 IF v_id IS NULL THEN RETURN false; END IF;
 PERFORM degen_record_proposal_event(v_id,'approval_claimed',p_reviewer,jsonb_build_object('status','dispatching')); RETURN true;
END $$;
CREATE OR REPLACE FUNCTION degen_reserve_daily_dispatch(p_cap integer)
RETURNS boolean LANGUAGE plpgsql AS $$ DECLARE v_count integer; BEGIN
 IF p_cap<1 THEN RAISE EXCEPTION 'daily cap must be positive'; END IF;
 INSERT INTO dispatch_daily_counts(dispatch_date,count,updated_at) VALUES(current_date,0,now()) ON CONFLICT(dispatch_date) DO NOTHING;
 UPDATE dispatch_daily_counts SET count=count+1,updated_at=now() WHERE dispatch_date=current_date AND count<p_cap RETURNING count INTO v_count;
 RETURN v_count IS NOT NULL;
END $$;
CREATE OR REPLACE FUNCTION degen_issue_review_token(p_proposal_id uuid,p_action text,p_token_digest text,p_expires_at timestamptz)
RETURNS boolean LANGUAGE plpgsql AS $$ DECLARE v_rows integer; BEGIN
 IF p_action NOT IN ('approve','reject') THEN RAISE EXCEPTION 'invalid review action'; END IF;
 UPDATE sprint_proposals SET approval_token_digest=p_token_digest,approval_token_action=p_action,
 approval_token_expires_at=p_expires_at,approval_token_used_at=NULL
 WHERE id=p_proposal_id AND status='pending_approval';
 GET DIAGNOSTICS v_rows=ROW_COUNT; RETURN v_rows=1;
END $$;
COMMIT;
