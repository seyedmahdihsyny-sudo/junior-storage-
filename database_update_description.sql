-- Junior Storage: add optional product descriptions
ALTER TABLE public.inventory
ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
