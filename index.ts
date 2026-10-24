import axios from 'axios';
import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';

const esperar = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function descargarConBackoff(urlPdf: string, rutaDestino: string, cabeceras: any, maxIntentos = 5) {
    for (let intento = 1; intento <= maxIntentos; intento++) {
        try {
            console.log(`         -> Descargando PDF (Intento ${intento})...`);
            const respuesta = await axios.get(urlPdf, {
                headers: cabeceras,
                responseType: 'stream'
            });

            const writer = fs.createWriteStream(rutaDestino);
            respuesta.data.pipe(writer);

            return await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });
        } catch (error: any) {
            if (error.response && error.response.status === 429) {
                const tiempoEspera = (2 ** intento) * 1000;
                console.log(`         [!] Error 429: Servidor saturado. Pausa de ${tiempoEspera / 1000}s...`);
                await esperar(tiempoEspera);
            } else {
                console.log(`         [X] Error crítico: ${error.message}`);
                break;
            }
        }
    }
}

async function ejecutarScraping() {
    const urlBase = 'https://pjett.trf5.jus.br';
    const urlLista = `${urlBase}/pjeconsulta/ConsultaPublica/listView.seam`;

    const cabecerasComunes = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8,pt;q=0.7',
        'Connection': 'keep-alive'
    };

    console.log('Preparando entorno de guardado...');
    const carpetaPdfs = path.join(__dirname, 'pdfs');
    if (!fs.existsSync(carpetaPdfs)) fs.mkdirSync(carpetaPdfs);

    const datosEstructurados: any[] = [];
    let contadorGlobal = 1;

    // CONFIGURACIÓN DE EXTRACCIÓN INDEFINIDA
    const fechaInicio = new Date(); 
    let diasConsecutivosVacios = 0;
    const LIMITE_DIAS_VACIOS = 60; // El programa se detendrá si pasa 60 días seguidos sin ver documentos

    console.log(`\n=== INICIANDO EXTRACCIÓN HASTA EL ORIGEN DE LOS TIEMPOS ===`);

    // BUCLE INFINITO: Avanza hacia atrás restando un día. Solo se detiene con el "break" interno.
    for (let fechaActual = new Date(fechaInicio); ; fechaActual.setUTCDate(fechaActual.getUTCDate() - 1)) {
        
        const dia = String(fechaActual.getUTCDate()).padStart(2, '0');
        const mes = String(fechaActual.getUTCMonth() + 1).padStart(2, '0');
        const anio = fechaActual.getUTCFullYear();
        const fechaString = `${dia}/${mes}/${anio}`;       
        const mesAnioString = `${mes}/${anio}`;            

        console.log(`\n[+] Consultando documentos del día: ${fechaString}`);

        try {
            const respuestaInicial = await axios.get(urlLista, { headers: cabecerasComunes });
            const rawCookies = respuestaInicial.headers['set-cookie'] || [];
            const cookiesLimpias = rawCookies.map(cookie => cookie.split(';')[0]).join('; ');

            const $ = cheerio.load(respuestaInicial.data);
            const tokenViewState = $('input[name="javax.faces.ViewState"]').val();

            if (!tokenViewState) {
                console.log(`   [!] No se pudo obtener el token para ${fechaString}. Saltando.`);
                continue;
            }

            const payload = new URLSearchParams();
            payload.append('javax.faces.ViewState', tokenViewState as string);
            payload.append('AJAXREQUEST', '_viewRoot');
            payload.append('fPP', 'fPP');
            payload.append('fPP:j_id244', 'fPP:j_id244');
            payload.append('mascaraProcessoReferenciaRadio', 'on');
            payload.append('tipoMascaraDocumento', 'on');
            payload.append('fPP:autoScroll', '');
            payload.append('AJAX:EVENTS_COUNT', '1');
            payload.append('fPP:dnp:nomeParte', '');
            payload.append('fPP:j_id180:nomeAdv', '');
            payload.append('fPP:j_id189:classeJudicial', '');
            payload.append('fPP:j_id189:sgbClasseJudicial_selection', '');
            payload.append('fPP:dpDec:documentoParte', '');
            payload.append('fPP:Decoration:numeroOAB', '');
            payload.append('fPP:Decoration:j_id223', '');
            payload.append('fPP:Decoration:estadoComboOAB', '0');
            
            payload.append('fPP:dataAutuacaoDecoration:dataAutuacaoInicioInputDate', fechaString);
            payload.append('fPP:dataAutuacaoDecoration:dataAutuacaoInicioInputCurrentDate', mesAnioString);
            payload.append('fPP:dataAutuacaoDecoration:dataAutuacaoFimInputDate', fechaString);
            payload.append('fPP:dataAutuacaoDecoration:dataAutuacaoFimInputCurrentDate', mesAnioString);

            const respuestaResultados = await axios.post(urlLista, payload, {
                headers: { ...cabecerasComunes, 'Content-Type': 'application/x-www-form-urlencoded', 'Faces-Request': 'partial/ajax', 'X-Requested-With': 'XMLHttpRequest', 'Origin': urlBase, 'Referer': urlLista, 'Cookie': cookiesLimpias }
            });

            const enlacesDetalles: string[] = [];
            const regexLista = /openPopUp\('[^']+','([^']+)'/g;
            let matchLista;
            while ((matchLista = regexLista.exec(respuestaResultados.data)) !== null) {
                enlacesDetalles.push(`${urlBase}${matchLista[1]}`);
            }

            // EVALUACIÓN DE PARADA AUTOMÁTICA
            if (enlacesDetalles.length === 0) {
                diasConsecutivosVacios++;
                console.log(`   -> Sin resultados. Días vacíos consecutivos: ${diasConsecutivosVacios}/${LIMITE_DIAS_VACIOS}`);
                if (diasConsecutivosVacios >= LIMITE_DIAS_VACIOS) {
                    console.log(`\n[!] Límite de inactividad superado. Se asume que no existen registros anteriores a esta fecha.`);
                    break; // Detiene el bucle por completo
                }
            } else {
                diasConsecutivosVacios = 0; // Se encontraron documentos, reiniciamos el contador
                console.log(`   -> Se encontraron ${enlacesDetalles.length} documentos para el ${fechaString}.`);

                for (let i = 0; i < enlacesDetalles.length; i++) {
                    const urlDocumento = enlacesDetalles[i];
                    console.log(`      Procesando doc [${i + 1}/${enlacesDetalles.length}] del ${fechaString}...`);

                    const cabecerasDocumento = { ...cabecerasComunes, 'Cookie': cookiesLimpias, 'Referer': urlLista };
                    const respuestaDocumento = await axios.get(urlDocumento, { headers: cabecerasDocumento });

                    const $doc = cheerio.load(respuestaDocumento.data);
                    const tituloPagina = $doc('title').text().trim() || `Documento_Sin_Titulo`;

                    const regexPdf = /openPopUp\('comprovante',\s*'([^']+)'/;
                    const matchPdf = regexPdf.exec(respuestaDocumento.data);

                    let estadoDescarga = "Fallido (No se encontró enlace)";
                    if (matchPdf && matchPdf[1]) {
                        let urlRelativaPdf = matchPdf[1];
                        if (!urlRelativaPdf.startsWith('/')) urlRelativaPdf = '/pjeconsulta/ConsultaPublica/DetalheProcessoConsultaPublica/' + urlRelativaPdf;

                        const urlCompletaPdf = `${urlBase}${urlRelativaPdf}`;
                        const nombreArchivo = `doc_${fechaString.replace(/\//g, '-')}_ID${contadorGlobal.toString().padStart(4, '0')}.pdf`;
                        const rutaGuardado = path.join(carpetaPdfs, nombreArchivo);

                        await descargarConBackoff(urlCompletaPdf, rutaGuardado, cabecerasDocumento);
                        estadoDescarga = `Guardado como ${nombreArchivo}`;
                    }

                    datosEstructurados.push({
                        id_global: contadorGlobal,
                        fecha_ingreso: fechaString,
                        titulo: tituloPagina,
                        url_origen: urlDocumento,
                        estado_pdf: estadoDescarga
                    });

                    contadorGlobal++;

                    if (i < enlacesDetalles.length - 1) {
                        await esperar(2000); 
                    }
                }
            }

        } catch (error: any) {
            console.error(`   [X] Error procesando el día ${fechaString}:`, error.message);
        }

        console.log(`   Esperando 3 segundos antes de viajar al día anterior...`);
        await esperar(3000);
    }

    const rutaJson = path.join(__dirname, 'datos_extraidos.json');
    fs.writeFileSync(rutaJson, JSON.stringify(datosEstructurados, null, 2));
    console.log(`\n=== PROCESO FINALIZADO ===`);
    console.log(`Datos totales extraídos guardados en: ${rutaJson}`);
}

ejecutarScraping();