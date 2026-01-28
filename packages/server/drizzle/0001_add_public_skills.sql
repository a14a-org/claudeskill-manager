-- Migration: Add public_skills table for sharing skills publicly
-- This table stores UNENCRYPTED skill content for public sharing
-- Skills go through a review workflow before becoming visible

CREATE TABLE IF NOT EXISTS "public_skills" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "skill_id" uuid REFERENCES "skills"("id") ON DELETE SET NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "slug" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "description" text,
  "category" text,
  "tags" text[],
  "content" text NOT NULL,
  "files" jsonb,
  "status" text DEFAULT 'pending' NOT NULL,
  "reviewed_by" uuid REFERENCES "users"("id"),
  "reviewed_at" timestamp,
  "rejection_reason" text,
  "download_count" integer DEFAULT 0 NOT NULL,
  "submitted_at" timestamp DEFAULT now() NOT NULL,
  "published_at" timestamp,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS "idx_public_skills_user_id" ON "public_skills" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_public_skills_status" ON "public_skills" ("status");
CREATE INDEX IF NOT EXISTS "idx_public_skills_category" ON "public_skills" ("category");

-- Add constraint for status values
ALTER TABLE "public_skills" ADD CONSTRAINT "public_skills_status_check"
  CHECK ("status" IN ('pending', 'approved', 'rejected'));
