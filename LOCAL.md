# Desarrollo local — dexcalidraw

Guía para levantar el entorno de desarrollo completo en tu máquina.

---

## Arquitectura local

```
Vite dev server    localhost:3001   ← app (HMR)
excalidraw-room    localhost:3002   ← WebSocket collab
PocketBase         localhost:8080   ← persistencia + Admin UI
```

---

## Requisitos

| Herramienta      | Versión mínima    | Verificar                  |
|------------------|-------------------|----------------------------|
| Node.js          | 18                | `node -v`                  |
| Yarn             | 1.22 (classic)    | `yarn -v`                  |
| Docker + Compose | Docker 24         | `docker compose version`   |

---

## Paso 1 — Clonar e instalar dependencias

```bash
git clone https://github.com/tu-usuario/dexcalidraw.git
cd dexcalidraw
yarn
```

El monorepo usa Yarn workspaces. `yarn` en la raíz instala todo (packages +
excalidraw-app).

---

## Paso 2 — Construir y levantar los servicios de backend

La primera vez hay que construir la imagen de PocketBase (descarga el binario
desde GitHub Releases):

```bash
docker compose build pocketbase
```

Luego levantar todos los servicios de backend:

```bash
docker compose up -d collab pocketbase
```

| Contenedor   | URL local               | Descripción               |
|--------------|-------------------------|---------------------------|
| `collab`     | —                       | WebSocket en puerto 3002  |
| `pocketbase` | `http://localhost:8080` | API REST + Admin UI       |

Verificar que ambos están corriendo:

```bash
docker compose ps
```

### Alternativa sin Docker — PocketBase binario

Descargar el binario v0.38.1 desde
https://github.com/pocketbase/pocketbase/releases/tag/v0.38.1
y ejecutar:

```bash
./pocketbase serve --http="localhost:8080" --migrationsDir=pb_migrations
```

---

## Paso 3 — Configurar PocketBase (primera vez)

Abrir `http://localhost:8080/_/` en el navegador y crear la cuenta de
administrador. Esto solo se hace una vez; los datos persisten en `pb_data/`.

Las colecciones `scenes` y `collab_files` se crean automáticamente al
arrancar gracias a `pb_migrations/1716768000_init.js`. No hay nada más que
configurar.

Para verificar: Admin UI → Collections → deberías ver `scenes` y `collab_files`.

---

## Paso 4 — Iniciar el servidor de desarrollo

```bash
yarn --cwd excalidraw-app start
```

La app abre en `http://localhost:3001` con HMR activo.

El archivo `.env.development` ya apunta a los servicios locales:

```env
VITE_APP_WS_SERVER_URL=http://localhost:3002
VITE_APP_POCKETBASE_URL=http://localhost:8080
```

---

## Paso 5 — Verificar que todo funciona

### App básica

- `http://localhost:3001` carga sin errores en consola.
- Dibujar elementos → se guardan en `localStorage`.

### Colaboración completa

1. Abrir `http://localhost:3001` → **Live collaboration** → Start session.
2. Copiar el URL generado (contiene `#room=roomId,roomKey`).
3. Abrirlo en otra pestaña del mismo navegador.
4. Dibujar en una pestaña → los cambios aparecen en la otra en tiempo real.
5. Recargar una pestaña → los elementos se restauran desde PocketBase.

### Verificar persistencia en PocketBase

Admin UI → Collections → `scenes` → debería haber un registro con el
`room_id` de la sala activa.

---

## Variables de entorno opcionales

Crear `.env.development.local` (no se commitea) para sobrescribir valores
sin tocar `.env.development`:

```env
# Deshabilitar ESLint para builds más rápidos
VITE_APP_ENABLE_ESLINT=false

# Deshabilitar HMR para depurar Service Workers
VITE_APP_DEV_DISABLE_LIVE_RELOAD=true

# Quitar el diálogo "¿Salir sin guardar?"
VITE_APP_DISABLE_PREVENT_UNLOAD=true
```

---

## Comandos útiles

```bash
# Type checking
yarn test:typecheck

# Tests con actualización de snapshots
yarn test:update

# Fix de formato y linting
yarn fix

# Build de producción local (para probar el bundle)
yarn --cwd excalidraw-app build:app:docker
npx http-server excalidraw-app/build -p 5001 -o

# Logs de un servicio
docker compose logs -f pocketbase
docker compose logs -f collab

# Aplicar nuevas migraciones (pb_migrations/ se monta como volumen)
docker compose restart pocketbase

# Resetear PocketBase completamente (borra todos los datos)
docker compose down pocketbase
rm -rf pb_data/
docker compose up -d pocketbase
```

---

## Estructura del proyecto

```
dexcalidraw/
├── packages/
│   ├── excalidraw/          # Librería principal (@excalidraw/excalidraw)
│   ├── element/             # Tipos y lógica de elementos
│   ├── common/              # Utilidades compartidas
│   ├── math/                # Matemáticas de geometría
│   └── utils/               # Utilidades generales
├── excalidraw-app/          # App web (lo que se despliega)
│   ├── collab/              # Lógica de colaboración (Socket.io)
│   ├── components/          # Componentes React de la app
│   ├── data/
│   │   ├── pocketbase.ts    # Persistencia (escenas + archivos)
│   │   └── index.ts         # getSyncableElements, etc.
│   └── App.tsx              # Componente raíz
├── pb_migrations/           # Migraciones de PocketBase (auto-aplicadas)
├── pb_data/                 # Datos de PocketBase (generado, no committear)
├── .env.development         # Variables para dev local
├── .env.production          # Variables para producción (baked en el build)
├── docker-compose.yml       # Servicios para desarrollo
├── docker-compose.prod.yml  # Servicios para producción
├── Dockerfile               # Build multi-stage app (Node 24 → Nginx)
├── Dockerfile.pocketbase    # Build PocketBase desde binario oficial
└── nginx.conf               # Config Nginx para la SPA
```

---

## Añadir `pb_data` al .gitignore

```bash
grep -q "pb_data/" .gitignore || echo "pb_data/" >> .gitignore
```

---

## Troubleshooting

**`VITE_APP_POCKETBASE_URL` no definido**
Reiniciar el servidor de Vite después de cambiar cualquier variable de entorno.

**WebSocket no conecta en colaboración**
```bash
docker compose ps          # verificar que collab está Up
docker compose logs collab # ver errores
```

**Las colecciones no existen en PocketBase**
La migración no se aplicó. Verificar que PocketBase arrancó con `--migrationsDir`:
```bash
docker compose logs pocketbase | grep -i migrat
```
Si el volumen `pb_migrations/` no estaba montado en el primer arranque,
resetear y reiniciar:
```bash
docker compose down pocketbase && rm -rf pb_data/
docker compose up -d pocketbase
```

**Errores de TypeScript en packages**
Los packages usan path aliases. Si el IDE no los resuelve, compilar una vez:
```bash
yarn build
```
