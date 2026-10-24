# TRF5 Judicial Scraper Challenge

Este proyecto es un web scraper desarrollado en TypeScript diseñado para extraer documentos públicos y archivos PDF del portal judicial TRF5 (`pjett.trf5.jus.br`). 

El objetivo principal de este desafío fue construir una herramienta robusta y eficiente **sin depender de navegadores automatizados** (como Puppeteer o Playwright), interactuando directamente a nivel de red (HTTP) y resolviendo múltiples barreras de seguridad de una arquitectura legacy (JavaServer Faces).

## Tecnologías Utilizadas
* **Lenguaje:** Node.js / TypeScript
* **Peticiones HTTP:** `axios`
* **Parseo HTML/DOM:** `cheerio`
* **Ejecución:** `tsx`

## Retos Técnicos Superados

1. **Evasión de Seguridad (CSRF y Headers):** Captura dinámica de tokens `ViewState`, limpieza de `Cookies` de sesión (`JSESSIONID`) y falsificación de cabeceras (`Origin`, `Referer`, `User-Agent`) simulando peticiones AJAX nativas.
2. **Limitación de Resultados (Date Walker):** El sistema restringe las respuestas a un máximo de 30 documentos sin paginación. Se diseñó un algoritmo iterativo que retrocede día a día de forma autónoma hasta el origen de los registros, garantizando la extracción de toda la base de datos.
3. **Manejo de Saturación (HTTP 429):** Integración de un algoritmo de *Backoff Exponencial* que detecta bloqueos del servidor y pausa la ejecución progresivamente antes de reintentar la descarga de PDFs.
4. **Respeto al Servidor:** Incorporación de *delays* estratégicos (2 a 3 segundos) entre consultas de documentos para evitar estrés en la infraestructura del Estado.

## Requisitos Previos
* **Node.js**: Versión 18.0.0 o superior.
* **NPM**: Gestor de paquetes incluido con Node.js.

## Instalación y Ejecución

1. Clonar el repositorio:
   ```bash
   git clone <https://github.com/dieimcor/scraper-challenge.git>
   cd scraper-challenge

2. Instalar las dependencias del proyecto:
    ```bash
    npm install

3. Ejecutar el scraper
    ```bash
    npm run start
