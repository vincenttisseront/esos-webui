-- Préférence de langue par utilisateur (i18n batch 1).
-- NULL = suivre le cookie / paramètre navigateur.
ALTER TABLE users ADD COLUMN preferred_locale TEXT;
