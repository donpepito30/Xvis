# Documentación Técnica: MatchIntel Elite

## 📌 Resumen del Proyecto
**MatchIntel Elite** es una plataforma de análisis y descubrimiento de transmisiones en tiempo real de alto rendimiento. Combina una arquitectura de backend robusta en Node.js con una interfaz visual "Elite Nexus" optimizada para la visualización de datos y el análisis predictivo mediante IA.

---

## 🏗️ Arquitectura del Sistema

### 1. Backend (Node.js + Express)
El núcleo del servidor reside en `server.ts`. Está diseñado bajo principios de alta disponibilidad y resiliencia.

- **Proxy de Datos Resiliente**: Implementa un mecanismo de reintento (`withRetry`) con retroceso exponencial para garantizar la sincronización con la API externa (`go.whitetrafsa.com`).
- **Seguridad y Control de Tráfico**: Posee un limitador de tasa (Rate Limiter) personalizado basado en IP para proteger los recursos y evitar el abuso de la cuota de la API.
- **Módulo de Inteligencia Artificial**: Integración profunda con el SDK de **Google Generative AI** (modelo `gemini-2.0-flash`). Procesa buffers de datos para generar resúmenes de mercado y tendencias en tiempo real.

### 2. Frontend (Híbrido)
El frontend utiliza un enfoque moderno y minimalista con **Tailwind CSS v4** para el estilizado y **Vite** para el empaquetado.

- **UI "Elite Nexus"**: Ubicada principalmente en `index.html`, implementa un diseño oscuro con efectos de iluminación neural, desenfoques de fondo (backdrop-blur) y animaciones de alta fidelidad.
- **React Ready**: El proyecto cuenta con soporte para React (`src/App.tsx`), permitiendo una migración modular a componentes de estado complejo si se requiere.

### 3. Arquitectura Multicloud (Vercel & Cloudflare Pages)
La plataforma está optimizada para desplegarse de manera redundante en múltiples nubes sin fricción:
- **Cloudflare Pages**: Utiliza un modelo de ejecución distribuida en el Edge. 
  - **Assets Estáticos**: Configurado nativamente mediante `wrangler.json` usando `"not_found_handling": "single-page-application"` para evitar colisiones de rutas.
  - **Edge Functions**: Las peticiones a la API bajo `/api/models/*` son procesadas por la función Edge de alto rendimiento en `/functions/api/models/[[type]].ts`.
  - **Seguridad**: Reglas de enrutamiento optimizadas mediante `/public/_routes.json` para delegar el procesamiento al motor Edge de Cloudflare únicamente en rutas dinámicas.
- **Vercel / Cloud Run**: Utiliza la arquitectura serverless tradicional basada en Node.js y Express mediante `server.ts` y `vercel.json` con soporte completo de rate-limiting e IP forwarding.

---

## 📡 Conexiones y Endpoints

### API Local
- `GET /api/models/:type?`: Proxy hacia el proveedor de datos. Soporta parámetros de consulta para filtrado (calidad, etiquetas, idioma).
- `POST /api/analyze`: Recibe un dataset de modelos y devuelve un análisis generado por IA (Resumen, Tendencias, Recomendación).

### Integraciones Externas
- **Proveedor de Datos**: `https://go.whitetrafsa.com/api/`
- **IA**: Google Gemini API via `@google/genai`.

---

## 🛠️ Guía de Desarrollo

### Requisitos Previos
- Node.js (v18+ recomendado)
- Clave de API de Gemini (configurada en `.env`)

### Scripts de Ejecución
- `npm run dev`: Inicia el servidor de desarrollo utilizando `tsx` para el backend y el middleware de Vite para el frontend.
- `npm run build`: Compila el frontend y genera un bundle de servidor CommonJS en `dist/server.cjs`.
- `npm run start`: Inicia la aplicación en modo producción.

### Convenciones de Código
1. **Tipado Estricto**: Todo nuevo desarrollo debe mantener la coherencia de tipos en TypeScript.
2. **Silencio de Logs**: En producción, evitar `console.error` para fallos de red o IA; usar `console.log` informativo para no saturar sistemas de monitoreo.
3. **Optimización de Tokens**: Al enviar datos a la IA, filtrar y minimizar el payload (ver lógica de `intelBuffer` en `server.ts`).

---

## 🔒 Variables de Entorno
El archivo `.env` debe contener:
```env
GEMINI_API_KEY=tu_clave_aqui
NODE_ENV=development
```

---

*MatchIntel Elite - Protocolo de Análisis de Nueva Generación.*
