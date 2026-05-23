-- Create investment_resources table
CREATE TABLE IF NOT EXISTS public.investment_resources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    category TEXT DEFAULT 'ETC',
    display_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.investment_resources ENABLE ROW LEVEL SECURITY;

-- Add policies
DROP POLICY IF EXISTS "Users can manage their own links" ON public.investment_resources;
CREATE POLICY "Users can manage their own links" ON public.investment_resources
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Add index
CREATE INDEX IF NOT EXISTS idx_resources_user_id ON public.investment_resources(user_id);
CREATE INDEX IF NOT EXISTS idx_resources_category ON public.investment_resources(category);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_investment_resources_updated_at') THEN
        CREATE TRIGGER update_investment_resources_updated_at
        BEFORE UPDATE ON public.investment_resources
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
