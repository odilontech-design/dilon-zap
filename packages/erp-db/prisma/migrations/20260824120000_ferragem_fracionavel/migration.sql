-- Insumo vendido a granel (kg, m, m²) em vez de por peça.
-- Aditiva e com default: bases existentes continuam se comportando como antes.
ALTER TABLE "Ferragem" ADD COLUMN "fracionavel" BOOLEAN NOT NULL DEFAULT false;
