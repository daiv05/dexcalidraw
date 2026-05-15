# Despliegue en producción — dexcalidraw

Guía completa para desplegar dexcalidraw en un servidor propio bajo
`dexcalidraw.deras.dev`.

---

## Arquitectura

```
Internet
  │
  ▼
Reverse proxy (Caddy / Nginx)       ← HTTPS + TLS automático
  ├─ dexcalidraw.deras.dev          → excalidraw  :3000  (Nginx + SPA)
  ├─ collab.dexcalidraw.deras.dev   → collab      :3002  (Socket.io)
  └─ pb.dexcalidraw.deras.dev       → pocketbase  :8080  (REST + Admin UI)
```

| Servicio      | Fuente                                        | Puerto interno |
|---------------|-----------------------------------------------|----------------|
| `excalidraw`  | Build local — `Dockerfile` (Node 24 → Nginx)  | 80             |
| `collab`      | `excalidraw/excalidraw-room:latest`           | 3002           |
| `pocketbase`  | Build local — `Dockerfile.pocketbase`         | 8080           |

---

## Requisitos del servidor

- Linux (Ubuntu 22.04 / Debian 12 recomendado)
- Docker ≥ 24 + Docker Compose ≥ 2.20
- Mínimo 1 vCPU / 1 GB RAM / 10 GB disco
- Puertos 80 y 443 abiertos hacia internet
- DNS resuelto antes del despliegue:
  - `dexcalidraw.deras.dev` → IP del servidor
  - `collab.dexcalidraw.deras.dev` → IP del servidor
  - `pb.dexcalidraw.deras.dev` → IP del servidor

---

## Paso 1 — Clonar el repositorio

```bash
git clone https://github.com/tu-usuario/dexcalidraw.git /opt/dexcalidraw
cd /opt/dexcalidraw
```

---

## Paso 2 — Revisar variables de entorno

El archivo `.env.production` ya contiene los valores correctos. Verificar
que los dominios coincidan con los tuyos:

```bash
cat .env.production
```

Los valores relevantes:

```env
VITE_APP_WS_SERVER_URL=https://collab.dexcalidraw.deras.dev
VITE_APP_POCKETBASE_URL=https://pb.dexcalidraw.deras.dev
```

> **Importante:** `VITE_APP_POCKETBASE_URL` se bake-a en el bundle de Vite
> en tiempo de build. Si cambias esta URL después, hay que reconstruir la
> imagen de `excalidraw`.

---

## Paso 3 — Construir e iniciar los servicios

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

La primera vez tarda ~5 min: descarga `excalidraw-room`, construye la app
de Node (Vite build) y construye la imagen de PocketBase (descarga el
binario desde GitHub Releases).

Seguir el progreso:

```bash
docker compose -f docker-compose.prod.yml logs -f
```

Verificar que los tres servicios están `Up`:

```bash
docker compose -f docker-compose.prod.yml ps
```

---

## Paso 4 — Reverse proxy con Caddy (recomendado)

Caddy gestiona HTTPS/TLS automáticamente con Let's Encrypt.

### Instalar Caddy

```bash
apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install caddy
```

### Caddyfile

Crear o editar `/etc/caddy/Caddyfile`:

```caddyfile
dexcalidraw.deras.dev {
    reverse_proxy localhost:3000
}

collab.dexcalidraw.deras.dev {
    reverse_proxy localhost:3002
}

pb.dexcalidraw.deras.dev {
    reverse_proxy localhost:8080
}
```

```bash
systemctl reload caddy
```

### Alternativa: Nginx + Certbot

<details>
<summary>Ver configuración Nginx</summary>

```nginx
# /etc/nginx/sites-available/dexcalidraw
server {
    server_name dexcalidraw.deras.dev;
    location / { proxy_pass http://localhost:3000; }
}

server {
    server_name collab.dexcalidraw.deras.dev;
    location / {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}

server {
    server_name pb.dexcalidraw.deras.dev;
    client_max_body_size 10M;
    location / { proxy_pass http://localhost:8080; }
}
```

```bash
ln -s /etc/nginx/sites-available/dexcalidraw /etc/nginx/sites-enabled/
certbot --nginx -d dexcalidraw.deras.dev \
                -d collab.dexcalidraw.deras.dev \
                -d pb.dexcalidraw.deras.dev
nginx -s reload
```

</details>

---

## Paso 5 — Configurar PocketBase (primera vez)

Con el reverse proxy activo, abrir el Admin UI en:

```
https://pb.dexcalidraw.deras.dev/_/
```

Crear la cuenta de administrador. Esto solo se hace una vez; los datos
persisten en `./pb_data/`.

La migración `pb_migrations/1716768000_init.js` está bakeada en la imagen
y se aplica automáticamente al arrancar. Crea las colecciones `scenes` y
`collab_files` con reglas de acceso públicas anónimas.

Para verificar: Admin UI → Collections → deberías ver `scenes` y `collab_files`.

---

## Paso 6 — Verificación

### App carga correctamente

Abrir `https://dexcalidraw.deras.dev` — la página debe cargar sin errores
en la consola del navegador.

### Colaboración funciona

1. Abrir la app → **Live collaboration** → Start session.
2. Copiar el URL con `#room=...` y abrirlo en otra pestaña o dispositivo.
3. Dibujar en una pestaña → los cambios aparecen en la otra.
4. Admin UI → Collections → `scenes` → debe aparecer un registro con el
   `room_id` de la sala.

### WebSocket conecta

DevTools → Network → WS → debe haber una conexión activa a
`wss://collab.dexcalidraw.deras.dev`.

---

## Actualizaciones

### Actualizar la app (excalidraw)

```bash
cd /opt/dexcalidraw
git pull
docker compose -f docker-compose.prod.yml up -d --build excalidraw
```

### Actualizar el servidor de collab

```bash
docker compose -f docker-compose.prod.yml pull collab
docker compose -f docker-compose.prod.yml up -d collab
```

### Actualizar PocketBase (nueva versión del binario)

Editar `Dockerfile.pocketbase` y cambiar `PB_VERSION`, luego reconstruir:

```bash
docker compose -f docker-compose.prod.yml up -d --build pocketbase
```

### Actualizar migraciones de PocketBase

Las migraciones se montan como volumen desde `./pb_migrations/` — no
requieren rebuild. Tras añadir un nuevo archivo en `pb_migrations/`,
reiniciar PocketBase para que las aplique:

```bash
git pull
docker compose -f docker-compose.prod.yml restart pocketbase
```

PocketBase lleva registro interno y aplica solo las migraciones nuevas.

---

## Backups

Los datos de PocketBase están en `./pb_data/`.

```bash
# Backup puntual
tar -czf backup-$(date +%Y%m%d).tar.gz pb_data/

# Cron diario a las 3am en /etc/crontab
0 3 * * * root tar -czf /backups/pb-$(date +\%Y\%m\%d).tar.gz /opt/dexcalidraw/pb_data/
```

PocketBase también ofrece backup desde el Admin UI → Settings → Backups,
que descarga un ZIP con toda la base de datos y los archivos.

---

## Gestión de servicios

```bash
# Estado de todos los servicios
docker compose -f docker-compose.prod.yml ps

# Logs de un servicio concreto
docker compose -f docker-compose.prod.yml logs -f pocketbase

# Reiniciar un servicio sin downtime del resto
docker compose -f docker-compose.prod.yml restart excalidraw

# Detener todo (los datos en pb_data/ se conservan)
docker compose -f docker-compose.prod.yml down

# Detener y borrar volúmenes — DESTRUCTIVO, elimina pb_data/
docker compose -f docker-compose.prod.yml down -v
```
