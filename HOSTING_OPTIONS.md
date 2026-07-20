# Opciones de Hosting Serverless (Sin Código de Servidor)

La aplicación **HealthAnalytics AI** es una solución web estática (HTML5, CSS3, JavaScript ES6+, Chart.js, PDF.js y SheetJS). **No requiere servidor backend, Node.js ni bases de datos activas en servidor**, lo que permite alojarla de forma 100% gratuita y sin costo de infraestructura.

---

## 🌐 Opción 1: GitHub Pages (Activación Automática e Inmediata)

Al subir el código a tu repositorio `https://github.com/hfmora1989-hub/SALUD`, el workflow **`deploy-pages.yml`** publicará la página web automáticamente en una URL pública:

📍 **URL pública generada:** `https://hfmora1989-hub.github.io/SALUD/`

### Pasos para Activar en GitHub:
1. En tu repositorio en GitHub, ve a **Settings > Pages**.
2. En **Build and deployment > Source**, selecciona **GitHub Actions**.
3. ¡Listo! Cada vez que hagas `git push`, tu aplicación estará disponible globalmente en esa URL.

---

## 🔥 Opción 2: Firebase Hosting (Ambientes Pruebas / Producción)

Configurado mediante los archivos `firebase.json` y `.firebaserc` incluidos en el proyecto.

- **Pruebas:** `https://health-analytics-staging.web.app`
- **Producción:** `https://health-analytics-prod.web.app`

### Despliegue con 1 comando:
```bash
# Desplegar a Pruebas
npm run deploy:staging

# Desplegar a Producción
npm run deploy:prod
```

---

## ⚡ Opción 3: Netlify / Vercel (Despliegue Instantáneo)

1. Conecta tu cuenta de GitHub en [Netlify](https://www.netlify.com/) o [Vercel](https://vercel.com/).
2. Selecciona el repositorio `hfmora1989-hub/SALUD`.
3. Haz clic en **Deploy** sin modificar ninguna configuración.
