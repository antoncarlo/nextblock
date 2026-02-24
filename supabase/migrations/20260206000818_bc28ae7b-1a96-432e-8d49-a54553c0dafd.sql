-- Create waitlist_submissions table
CREATE TABLE public.waitlist_submissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name TEXT NOT NULL,
  company TEXT NOT NULL,
  email TEXT NOT NULL,
  interest TEXT NOT NULL CHECK (interest IN ('curator', 'investor', 'partner')),
  message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.waitlist_submissions ENABLE ROW LEVEL SECURITY;

-- Allow anonymous inserts (public waitlist form)
CREATE POLICY "Anyone can submit to waitlist" 
ON public.waitlist_submissions 
FOR INSERT 
WITH CHECK (true);

-- Only authenticated admins can view submissions (for now, no one can read)
-- You can add admin access later if needed