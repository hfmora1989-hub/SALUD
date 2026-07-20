# Registro de Cambios (CHANGELOG) - HealthAnalytics AI

Todas las modificaciones notables de este proyecto están documentadas en este archivo según los principios de [Semantic Versioning (SemVer)](https://semver.org/es/).

---

## [1.0.0] - 2026-07-20

### 🚀 Novedades y Características Principales
- **Despliegue Multi-Ambiente en Firebase**:
  - Configuración de targets para **Ambiente de Pruebas (Staging)** y **Ambiente de Producción (Prod)** (`firebase.json`, `.firebaserc`).
  - Creación de guía completa de configuración en `FIREBASE_SETUP.md`.

- **Pipelines de Integración y Despliegue Continuos (CI/CD)**:
  - `.github/workflows/deploy-staging.yml`: Automatización de despliegues al canal `staging` en Firebase.
  - `.github/workflows/deploy-production.yml`: Automatización de despliegues a `live` en Firebase tras publicaciones o tags `v*`.

- **Exportación de Historial Clínico a Excel**:
  - Integración de SheetJS (`xlsx.full.min.js`).
  - Botón en la interfaz para descargar un archivo `.xlsx` estructurado en pestañas:
    1. *Perfil del Paciente y Métricas*
    2. *Historial de Exámenes y Rangos Médicos*
    3. *Evaluación de Riesgo y Recomendaciones*

- **Gestión y Limpieza de Información ("Cargar de cero")**:
  - Botón interactivo **Eliminar Información Actual** con confirmación mediante modal de seguridad.
  - Vaciado total o parcial de datos locales (`localStorage`) y reinicio inmediato del estado de la aplicación.

- **Badges de Entorno y Control de Versión**:
  - Incorporación visual del tag de versión (`v1.0.0`) y badge del ambiente actual en el Topbar.

---

### 📦 Guía de Control de Versiones

Para incrementar la versión de la solución mediante consola:
```bash
# Incrementar versión de parche (ej: 1.0.0 -> 1.0.1)
npm run version:bump

# Crear tag de versión en Git
git tag -a v1.0.0 -m "Release v1.0.0"

# Enviar tag a GitHub para disparar el Pipeline de Producción
git push origin v1.0.0
```
