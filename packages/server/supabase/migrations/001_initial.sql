-- Click-Ship Cloud Database Schema
-- Migration: 001_initial
-- Description: Initial schema for multi-tenant SaaS

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- Organizations (multi-tenant)
-- ============================================
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    plan VARCHAR(50) DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
    github_installation_id BIGINT,
    slack_webhook_url TEXT,
    slack_team_id VARCHAR(50),
    linear_token TEXT,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for slug lookups
CREATE INDEX idx_organizations_slug ON organizations(slug);
CREATE INDEX idx_organizations_github_installation ON organizations(github_installation_id);

-- ============================================
-- Users
-- ============================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    github_id BIGINT UNIQUE NOT NULL,
    github_login VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    name VARCHAR(255),
    avatar_url TEXT,
    slack_id VARCHAR(50),
    linear_id VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for GitHub lookups
CREATE INDEX idx_users_github_id ON users(github_id);
CREATE INDEX idx_users_github_login ON users(github_login);

-- ============================================
-- Organization Memberships
-- ============================================
CREATE TABLE org_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(org_id, user_id)
);

-- Indexes for membership queries
CREATE INDEX idx_org_memberships_org_id ON org_memberships(org_id);
CREATE INDEX idx_org_memberships_user_id ON org_memberships(user_id);

-- ============================================
-- Connected Repositories
-- ============================================
CREATE TABLE repositories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    github_repo_id BIGINT NOT NULL,
    owner VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    full_name VARCHAR(512) GENERATED ALWAYS AS (owner || '/' || name) STORED,
    default_branch VARCHAR(100) DEFAULT 'main',
    framework VARCHAR(50),
    design_tokens JSONB DEFAULT '{}',
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(org_id, github_repo_id)
);

-- Indexes for repository queries
CREATE INDEX idx_repositories_org_id ON repositories(org_id);
CREATE INDEX idx_repositories_github_repo_id ON repositories(github_repo_id);
CREATE INDEX idx_repositories_full_name ON repositories(full_name);

-- ============================================
-- Edit History
-- ============================================
CREATE TABLE edits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    repo_id UUID REFERENCES repositories(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Edit details
    selector TEXT NOT NULL,
    description TEXT NOT NULL,
    page_url TEXT NOT NULL,
    file_path TEXT NOT NULL,

    -- Code changes
    original_code TEXT,
    modified_code TEXT,

    -- Git/PR info
    branch_name VARCHAR(255),
    commit_sha VARCHAR(40),
    pr_number INTEGER,
    pr_url TEXT,
    pr_status VARCHAR(50) DEFAULT 'open' CHECK (pr_status IN ('open', 'merged', 'closed')),

    -- AI metadata
    ai_model VARCHAR(100),
    ai_tokens_used INTEGER,
    ai_confidence DECIMAL(3,2),

    -- Source tracking
    source VARCHAR(50) DEFAULT 'extension' CHECK (source IN ('extension', 'figma', 'slack', 'api')),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for edit queries
CREATE INDEX idx_edits_org_id ON edits(org_id);
CREATE INDEX idx_edits_repo_id ON edits(repo_id);
CREATE INDEX idx_edits_user_id ON edits(user_id);
CREATE INDEX idx_edits_pr_status ON edits(pr_status);
CREATE INDEX idx_edits_created_at ON edits(created_at DESC);

-- ============================================
-- Annotations (Design Feedback)
-- ============================================
CREATE TABLE annotations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    repo_id UUID REFERENCES repositories(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Annotation details
    selector TEXT NOT NULL,
    page_url TEXT NOT NULL,
    note_text TEXT NOT NULL,

    -- Position data (for precise overlay placement)
    position_data JSONB,

    -- Status tracking
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'resolved', 'dismissed')),

    -- Linked edit (when annotation becomes a PR)
    edit_id UUID REFERENCES edits(id) ON DELETE SET NULL,

    -- Linear integration
    linear_issue_id VARCHAR(50),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for annotation queries
CREATE INDEX idx_annotations_org_id ON annotations(org_id);
CREATE INDEX idx_annotations_repo_id ON annotations(repo_id);
CREATE INDEX idx_annotations_user_id ON annotations(user_id);
CREATE INDEX idx_annotations_status ON annotations(status);
CREATE INDEX idx_annotations_page_url ON annotations(page_url);

-- ============================================
-- Sessions (JWT Token Management)
-- ============================================
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    token_hash VARCHAR(64) NOT NULL, -- SHA-256 hash of token
    github_token_encrypted TEXT, -- Encrypted GitHub access token
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for session lookups
CREATE INDEX idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

-- ============================================
-- Audit Log
-- ============================================
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id UUID,
    metadata JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for audit queries
CREATE INDEX idx_audit_log_org_id ON audit_log(org_id);
CREATE INDEX idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX idx_audit_log_action ON audit_log(action);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at DESC);

-- ============================================
-- Updated At Trigger Function
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to tables with updated_at
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_repositories_updated_at BEFORE UPDATE ON repositories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_edits_updated_at BEFORE UPDATE ON edits
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_annotations_updated_at BEFORE UPDATE ON annotations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Row Level Security (RLS)
-- ============================================
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE repositories ENABLE ROW LEVEL SECURITY;
ALTER TABLE edits ENABLE ROW LEVEL SECURITY;
ALTER TABLE annotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies will be added via Supabase dashboard or separate migration
-- For service role access (backend), RLS is bypassed

-- ============================================
-- Comments for Documentation
-- ============================================
COMMENT ON TABLE organizations IS 'Multi-tenant organizations/teams';
COMMENT ON TABLE users IS 'Users authenticated via GitHub';
COMMENT ON TABLE org_memberships IS 'User membership in organizations';
COMMENT ON TABLE repositories IS 'GitHub repositories connected to Click-Ship';
COMMENT ON TABLE edits IS 'History of code edits made via Click-Ship';
COMMENT ON TABLE annotations IS 'Design feedback annotations before conversion to edits';
COMMENT ON TABLE sessions IS 'User session management for JWT tokens';
COMMENT ON TABLE audit_log IS 'Audit trail for security and compliance';
