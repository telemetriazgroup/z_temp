import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cargarSerieEquipo, serieACsv } from './serie.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENGINE_DIR = path.resolve(__dirname, '../../informe/engine');
const ROOT = path.resolve(__dirname, '../../data/informes');
const PYTHON = process.env.INFORME_PYTHON || 'python3';

const jobs = new Map();

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

export function getInformeJob(id) {
  return jobs.get(id) ?? null;
}

export function informeFilePath(jobId, nombre) {
  const base = path.resolve(ROOT, jobId);
  const file = path.resolve(base, nombre);
  if (!file.startsWith(base + path.sep)) return null;
  return file;
}

function configDe(input, salida) {
  return {
    salida,
    zona_csv: 'America/Lima',
    zona_informe: 'America/Lima',
    zona_horaria: 'America/Lima',
    idioma: input.idioma || 'es',
    tolerancia: Number(input.tolerancia ?? 9),
    sensor_control: 'return_air',
    sensores_acotados_a_banda: ['return_air'],
    hueco_min_min: Number(input.huecoMinMin ?? 120),
    defrost_umbral_inicio: Number(input.defrostInicio ?? -8),
    defrost_umbral_fin: Number(input.defrostFin ?? -14),
    defrost_duracion_max_min: Number(input.defrostMaxMin ?? 60),
    reconstruir: input.reconstruir !== false,
    hueco_max_reconstruible_h:
      input.huecoMaxHoras === '' || input.huecoMaxHoras == null
        ? null
        : Number(input.huecoMaxHoras),
    semilla: 20260101,
    dpi_grafica: 110,
    logo: path.join(ENGINE_DIR, 'logo_2.png'),
    marca: 'ZTRACK',
    empresa: input.empresa || 'ZGROUP SAC - Monitoreo de cadena de frio',
    pie_izquierdo: input.pieIzquierdo || 'ZGROUP SAC | Plataforma Ztrack de telemetria',
    pie_centro: input.pieCentro || 'Telemetria en vivo',
    temp_min_valida: -40,
    temp_max_valida: 50,
    nombres_equipos: {},
    desde: input.desde,
    hasta: input.hasta,
    nombre_equipo: input.nombre,
    umbral_horas_fuera: input.umbralHorasFuera ?? null,
    ajustes_dia: input.ajustesDia ?? [],
  };
}

function runPython(csvPath, cfgPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON, [path.join(ENGINE_DIR, 'run_serie.py'), csvPath, cfgPath], {
      cwd: ENGINE_DIR,
      env: { ...process.env, MPLBACKEND: 'Agg', TZ: 'America/Lima', PYTHONUNBUFFERED: '1' },
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('El informe superó 15 minutos'));
    }, 15 * 60 * 1000);
    child.stdout.on('data', (buf) => {
      stdout += buf.toString();
    });
    child.stderr.on('data', (buf) => {
      stderr += buf.toString();
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      const line = stdout.split('\n').reverse().find((l) => l.startsWith('RESULT '));
      if (code !== 0 || !line) {
        const tail = (stderr || stdout).trim().split('\n').slice(-8).join('\n');
        reject(new Error(tail || `El generador terminó con código ${code}`));
        return;
      }
      let result;
      try {
        result = JSON.parse(line.slice('RESULT '.length));
      } catch (err) {
        reject(new Error(`El generador devolvió un resultado ilegible: ${err.message}`));
        return;
      }
      resolve({
        result,
        log: stdout
          .split('\n')
          .filter((l) => l && !l.startsWith('RESULT '))
          .slice(-40),
      });
    });
  });
}

export async function generarInformeSync(input) {
  const id = input.dirId || `inf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const dir = path.join(ROOT, id);
  ensureDir(dir);
  const rows = await cargarSerieEquipo({
    codigo: input.codigo,
    imei: input.imei,
    desde: input.desde,
    hasta: input.hasta,
  });
  const csvPath = path.join(dir, 'serie.csv');
  const cfgPath = path.join(dir, 'config.json');
  fs.writeFileSync(csvPath, serieACsv(rows));
  fs.writeFileSync(cfgPath, JSON.stringify(configDe(input, dir)));
  const done = await runPython(csvPath, cfgPath);
  const pdfs = done.result?.pdfs ?? [];
  const pdfName = pdfs.find((n) => String(n).startsWith('Informe_')) || pdfs[0];
  if (!pdfName) throw new Error('El generador no produjo el PDF');
  return {
    dir,
    pdfPath: path.join(dir, pdfName),
    pdfName,
    pdfs: pdfs.map((n) => ({ nombre: n, ruta: path.join(dir, n) })),
    result: done.result,
    muestras: rows.length,
  };
}

export function startInformeJob(input) {
  const id = `inf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const job = {
    id,
    status: 'queued',
    owner: input.owner ?? null,
    nombre: input.nombre,
    imei: input.imei,
    codigo: input.codigo,
    desde: input.desde,
    hasta: input.hasta,
    log: [],
    error: null,
    result: null,
    createdAt: new Date().toISOString(),
  };
  jobs.set(id, job);

  void (async () => {
    try {
      job.status = 'running';
      job.log.push('Leyendo historial oficial del equipo…');
      const done = await generarInformeSync({ ...input, dirId: id });
      job.log.push(`${done.muestras} muestras entre ${input.desde} y ${input.hasta}`);
      job.log.push('PDF listo');
      job.result = done.result;
      job.status = 'done';
    } catch (e) {
      job.status = 'error';
      job.error = e.message || String(e);
      job.log.push(job.error);
    }
  })();

  return job;
}
