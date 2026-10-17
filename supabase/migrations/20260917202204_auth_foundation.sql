CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  app_user_name TEXT NOT NULL UNIQUE CHECK (app_user_name IN ('seval', 'mateo')),
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS public.couples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS public.couple_members (
  couple_id UUID NOT NULL REFERENCES public.couples(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (couple_id, user_id),
  UNIQUE (user_id)
);
CREATE INDEX IF NOT EXISTS couple_members_user_id_idx ON public.couple_members (user_id);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.couples ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.couple_members ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.is_couple_member(target_couple_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.couple_members
    WHERE couple_id = target_couple_id AND user_id = auth.uid()
  );
$$;
REVOKE ALL ON FUNCTION public.is_couple_member(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_couple_member(UUID) TO authenticated;
CREATE POLICY "profiles: users read own profile"
  ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "couples: members read own couple"
  ON public.couples FOR SELECT TO authenticated USING (public.is_couple_member(id));
CREATE POLICY "couple_members: members read own couple membership"
  ON public.couple_members FOR SELECT TO authenticated USING (public.is_couple_member(couple_id));
