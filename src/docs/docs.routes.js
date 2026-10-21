// API documentation routes: `/openapi.json` (machine-readable spec) aur `/docs` (Swagger UI, browser mein dekhne ke liye).
// config.docsEnabled false ho (production default) to ye router mount hi nahi hota.

import express, { Router } from 'express';
// swagger-ui-dist: Swagger UI ki ready-made static files (HTML/JS/CSS). CommonJS package hai, isliye default import.
import swaggerUiDist from 'swagger-ui-dist';

// Swagger UI ka starting script. Alag file isliye ki Helmet ki default CSP (Content-Security-Policy) inline
// <script> block karti hai; hum sirf same-origin files serve karte hain, CSP ko dheela nahi karna padta.
// '../openapi.json' relative hai: /docs/ se ek level upar = /openapi.json (proxy ke peeche prefix ho to bhi chalta hai).
const INITIALIZER = `window.onload = function () {
  window.ui = SwaggerUIBundle({
    url: '../openapi.json',
    dom_id: '#swagger-ui',
    deepLinking: true,
    presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
    layout: 'StandaloneLayout',
  });
};
`;

/** @param {{spec: object}} options buildOpenApiSpec() ka result (startup par ek baar bana hua) */
export function createDocsRouter({ spec }) {
  const router = Router();

  router.get('/openapi.json', (_req, res) => {
    res.json(spec);
  });

  // Ye route static middleware se PEHLE hona zaruri hai, warna package ki default initializer file
  // (jo petstore example kholti hai) serve ho jaati.
  router.get('/docs/swagger-initializer.js', (_req, res) => {
    res.type('application/javascript').send(INITIALIZER);
  });

  // Baaki Swagger UI files (index.html, swagger-ui-bundle.js, css...) package se.
  router.use('/docs', express.static(swaggerUiDist.getAbsoluteFSPath()));

  return router;
}
