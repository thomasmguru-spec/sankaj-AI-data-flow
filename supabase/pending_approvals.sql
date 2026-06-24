-- 1. Create an ENUM type to easily track order validation lifecycle
CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE order_type AS ENUM ('image', 'text');

-- 2. Create the temporary approvals table
CREATE TABLE public.pending_approvals (
    -- Unique identifier used by Vercel to pull the data
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Tracks the exact n8n execution instance for audit safety
    n8n_execution_id VARCHAR(255) NOT NULL,

    -- Callback URL for the n8n Wait node to resume the workflow after approval
    n8n_wait_node_callbackurl TEXT,
    
    -- Metadata about the original communication
    whatsapp_sender VARCHAR(50) NOT NULL,
    twilio_message_sid VARCHAR(255),
    media_url TEXT,
    
    -- The core analyzed inventory items saved as a flexible JSONB array
    analyzed_items JSONB NOT NULL DEFAULT '[]'::jsonb,
    
    -- Status flags
    status approval_status NOT NULL DEFAULT 'pending',
    type order_type NOT NULL DEFAULT 'image',
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Add an index on the status column for fast Vercel dashboard queries
CREATE INDEX idx_pending_approvals_status ON public.pending_approvals(status);

-- 4. Enable Row Level Security (RLS) for API safety
ALTER TABLE public.pending_approvals ENABLE ROW LEVEL SECURITY;