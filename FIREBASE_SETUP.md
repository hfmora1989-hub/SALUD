# Guía de Configuración y Despliegue en Firebase Hosting

Esta guía detalla el proceso para configurar los ambientes de **Pruebas (Staging)** y **Producción (Prod)** de la plataforma **HealthAnalytics AI**, además de cómo conectar los pipelines de GitHub Actions.

---

## 📋 Pre-requisitos

1. Tener Node.js instalado (v18+ recomendado).
2. Tener cuenta en [Firebase Console](https://console.firebase.google.com/).
3. Instalar Firebase CLI globalmente:
   ```bash
   npm install -g firebase-tools
   ```

---

## 🛠️ Paso 1: Autenticación e Inicialización de Proyectos en Firebase

1. **Inicia sesión en Firebase desde la terminal:**
   ```bash
   firebase login
   ```

2. **Crea dos proyectos en la Consola de Firebase:**
   - Proyecto Pruebas: `health-analytics-staging`
   - Proyecto Producción: `health-analytics-prod`

3. **Configura los Targets de Hosting en tu proyecto local:**
   ```bash
   # Aplicar target para staging
   firebase target:apply hosting staging health-analytics-staging

   # Aplicar target para producción
   firebase target:apply hosting production health-analytics-prod
   ```

---

## 🚀 Paso 2: Despliegue Manual desde Terminal

### A. Desplegar al Ambiente de Pruebas (Staging)
```bash
npm run deploy:staging
# O mediante Firebase CLI:
firebase deploy --only hosting:staging
```

### B. Desplegar al Ambiente de Producción (Prod)
```bash
npm run deploy:prod
# O mediante Firebase CLI:
firebase deploy --only hosting:production
```

### C. Desplegar a un Canal de Vista Previa (Preview Channel)
Para probar una característica aislada por 7 días:
```bash
firebase hosting:channel:deploy mi-nueva-funcion
```

---

## 🤖 Paso 3: Configuración de Pipelines CI/CD con GitHub Actions

1. **Obtener Cuenta de Servicio de Firebase (Service Account):**
   ```bash
   firebase init hosting:github
   ```
   Esto generará las llaves JSON secretas para cada proyecto.

2. **Agregar Secretos en GitHub Repository:**
   - En tu repositorio de GitHub, ve a **Settings > Secrets and variables > Actions**.
   - Agrega el secreto para pruebas: `FIREBASE_SERVICE_ACCOUNT_HEALTH_ANALYTICS_STAGING`
   - Agrega el secreto para producción: `FIREBASE_SERVICE_ACCOUNT_HEALTH_ANALYTICS_PROD`

3. **Funcionamiento del Pipeline:**
   - Al hacer `push` a ramas `develop` o `feature/*`, el pipeline desplegará automáticamente al ambiente de **Pruebas**.
   - Al crear un tag de versión (ej: `git tag v1.0.0` y `git push origin v1.0.0`), el pipeline desplegará automáticamente al ambiente de **Producción**.

---

## 📊 Características Integradas en la Aplicación
- **Badge de Entorno:** Muestra si la aplicación corre en Pruebas o Producción.
- **Versión de Software:** Muestra la versión actual según `package.json` (`v1.0.0`).
- **Exportación a Excel:** Botón para generar reporte en `.xlsx`.
- **Restablecimiento de Información:** Botón para borrar datos y empezar de cero con modal de confirmación.
