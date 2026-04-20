-- Crear tabla de monedas si no existe
CREATE TABLE IF NOT EXISTS monedas (
    id SERIAL PRIMARY KEY,
    codigo VARCHAR(3) UNIQUE NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    habilitada BOOLEAN DEFAULT TRUE,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insertar monedas iniciales
INSERT INTO monedas (codigo, nombre, habilitada) VALUES
('USD', 'Dólar Estadounidense', TRUE),
('BOB', 'Boliviano', TRUE),
('EUR', 'Euro', TRUE)
ON CONFLICT (codigo) DO NOTHING;