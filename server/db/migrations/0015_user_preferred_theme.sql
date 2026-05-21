-- Préférence thème utilisateur : light | dark | system | NULL (suit le cookie)
ALTER TABLE users ADD COLUMN preferred_theme TEXT;
