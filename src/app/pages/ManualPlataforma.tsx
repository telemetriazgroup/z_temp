import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '../components/ui/button';
import { cn } from '../components/ui/utils';

const base = import.meta.env.BASE_URL;

type Marco = {
  top: number;
  left: number;
  width: number;
  height: number;
  etiqueta: string;
};

type Paso = {
  id: string;
  titulo: string;
  imagen: string;
  texto: string;
  acciones: string[];
  marcos: Marco[];
};

const PASOS: Paso[] = [
  {
    id: 'login',
    titulo: 'Entrar a la plataforma',
    imagen: 'login.png',
    texto:
      'La pantalla de acceso es la de ZTRACK. Escriba el **usuario** y la **contraseña** que le entregó el administrador y pulse **Ingresar**. Esta guía sigue a una cuenta de monitoreo admin, con análisis de telemetría activo. Esa cuenta ve **solo los equipos que le asignaron**, no la flota completa.',
    acciones: [
      'Abra la plataforma e identifique el formulario de la derecha.',
      'Escriba usuario y contraseña.',
      'Pulse Ingresar. El menú de un monitoreo admin es Inicio, Listado, Generador de informes, Administración, Usuarios, Alarmas, Catálogo Alarmas, Correo y Ayuda.',
    ],
    marcos: [{ top: 28, left: 58, width: 34, height: 48, etiqueta: 'Usuario, contraseña e Ingresar' }],
  },
  {
    id: 'inicio',
    titulo: 'Inicio · las cinco tarjetas',
    imagen: 'inicio.png',
    texto:
      'Al entrar ve el Panel de control de su flota. **Online, Wait y Offline** hablan de la conexión. **En rango** y **Fuera de rango** hablan de la temperatura. Cada tarjeta abre el listado ya filtrado.',
    acciones: [
      'Online: el equipo está comunicando. No dice si la temperatura está bien.',
      'Wait: la última muestra ya no es reciente y todavía no se declara fuera de línea.',
      'Offline: no llega telemetría.',
      'En rango: el retorno está dentro de la banda del set. Un equipo apagado no entra aquí.',
      'Fuera de rango: atiéndala primero. Al pulsarla, el listado muestra solo esos equipos.',
    ],
    marcos: [{ top: 12.6, left: 15.1, width: 82.6, height: 8.2, etiqueta: 'Pulse una tarjeta para abrir el listado filtrado' }],
  },
  {
    id: 'inicio-semana',
    titulo: 'Inicio · semana, promedios y gráficos',
    imagen: 'inicio.png',
    texto:
      'Debajo de las tarjetas está el estatus de la semana (en esta captura, “Semana a vigilar”: online 44.5 % y en rango 55.9 %, ambos por debajo de la semana anterior). Más abajo, los promedios de día, semana y mes, y dos gráficos: conexión (online, wait, offline) y temperatura (en rango y fuera). Al pie, si hay alarmas o correos recientes, y los equipos que están conectados ahora, ya con su nombre.',
    acciones: [
      'Use el estatus de la semana para la reunión, no para la alarma del momento.',
      'El gráfico de temperatura separa en rango (verde) y fuera (rojo).',
      '“Ver listado” arriba a la derecha abre la tabla completa.',
    ],
    marcos: [
      { top: 22.1, left: 15.1, width: 82.6, height: 11.8, etiqueta: 'Estatus de la semana' },
      { top: 53, left: 15.1, width: 82.6, height: 25.6, etiqueta: 'Conexión y temperatura' },
    ],
  },
  {
    id: 'listado',
    titulo: 'Listado · en rango, fuera y sin lectura',
    imagen: 'listado.png',
    texto:
      'Cada fila lleva su nombre, con ZGRU, cliente, cotización y teléfono. La pastilla verde **NORMAL** es en rango. La roja **FUERA** es fuera de rango. Una fila sin Power ni temperaturas es una **lectura vacía, no un apagado**. La columna **3h** abre las últimas 3 horas de esa fila.',
    acciones: [
      'Estado filtra Online, Wait, Offline o Historial.',
      'Rango filtra En rango, Fuera de rango o Apagado.',
      'Código separa TUNEL, STARCOOL, STARCOOL2 y TERMOKING. En esta cuenta los 18 son STARCOOL2.',
      'Pulse la fila (**no el lápiz ni el icono de 3 h**) para abrir el detalle del equipo.',
      'El lápiz cambia el nombre visible. **No cambia el IMEI**.',
    ],
    marcos: [
      { top: 11.8, left: 18.1, width: 69.6, height: 7.2, etiqueta: 'Filtros de estado, rango y código' },
      { top: 23.3, left: 73.4, width: 6.8, height: 65.2, etiqueta: 'NORMAL o FUERA' },
    ],
  },
  {
    id: 'apagado',
    titulo: 'Listado · filtro Apagado',
    imagen: 'apagado.png',
    texto:
      '**Apagado es Power en OFF**, no “sin datos”. Una fila con guiones y sin estado de energía no entra en este filtro. Cuando un equipo esté apagado de verdad, aparece aquí con **Power OFF** y sin temperatura de trabajo.',
    acciones: [
      'En Rango, pulse Apagado.',
      'El total de la derecha dice cuántos quedaron visibles.',
      'Vuelva a Todos para ver otra vez la flota completa.',
    ],
    marcos: [{ top: 12.6, left: 82.7, width: 5.2, height: 3.2, etiqueta: 'Apagado' }],
  },
  {
    id: 'detalle',
    titulo: 'Detalle del equipo',
    imagen: 'detalle.png',
    texto:
      'Al pulsar una fila FUERA se abre el equipo. Este es ZGRU6102452 CARNES DEL VALLE S.A., IMEI 860389052204704, código STARCOOL2, estado WAIT, última actualización 26/11/2026 11:03. El set está en −20 °C y el retorno en 7.25 °C: por eso el listado lo marca FUERA. Suministro 6 °C, evaporador 6.5 °C, potencia 0 %. Las pestañas Equipo e Incidentes están arriba del nombre.',
    acciones: [
      'Confirme IMEI, código y la hora de la última actualización.',
      'Compare set, retorno y suministro. **El retorno es el que define en rango o fuera.**',
      'WAIT en la ficha es el mismo Wait del panel: señal vieja, todavía no offline.',
    ],
    marcos: [{ top: 31.1, left: 15.2, width: 82.5, height: 17.8, etiqueta: 'Telemetría principal' }],
  },
  {
    id: 'sectores',
    titulo: 'Cada sector del equipo',
    imagen: 'detalle.png',
    texto:
      '**Ver más datos** abre el resto de sectores del mismo equipo: condensador, CO₂, oxígeno, sensores de carga, consumo, alarmas y el estado de energía. **Ver menos** los oculta. Un sensor en 128 °C o un nivel Nulo es el valor que entregó el equipo: **no lo reemplace a mano**.',
    acciones: [
      'Pulse Ver más datos debajo de las seis tarjetas principales.',
      'Revise condensador, sensores y estado.',
      'La campana de Alarmas muestra el número de alarma del equipo, si trae uno.',
    ],
    marcos: [{ top: 54.6, left: 15.2, width: 82.5, height: 41, etiqueta: 'Sectores adicionales' }],
  },
  {
    id: 'grafica',
    titulo: 'Gráfica histórica',
    imagen: 'grafica.png',
    texto:
      'Más abajo está el historial oficial, en hora de Perú (GMT-5). Esta captura es el 26/11/2026, de 00:14 a 12:14, 70 registros del mismo IMEI. Suministro en verde, retorno en rojo, evaporador en gris y set en amarillo. El retorno baja desde unos 25 °C y se queda cerca de 7 °C, lejos del set −20 °C. La tabla de debajo es la misma consulta, del más reciente al más antiguo. CSV, Excel y PDF exportan esa ventana.',
    acciones: [
      'Ajuste fecha inicial y final y pulse Buscar, o use Últimas 12 h.',
      'En SERIES, a la derecha, encienda o apague suministro, retorno, evaporador y set.',
      'La columna 3h del listado abre solo la ventana corta. Esta gráfica es el historial de la fecha que eligió.',
    ],
    marcos: [{ top: 2, left: 2, width: 96, height: 40, etiqueta: 'Gráfica del día' }],
  },
  {
    id: 'analisis-ir',
    titulo: 'Análisis de telemetría · pedirlo',
    imagen: 'analisis-confirmar.png',
    texto:
      'Si la cuenta tiene análisis de telemetría, el panel aparece debajo de la tabla. **Analizar este mes** pide confirmación del rango normal, medido en el **aire de retorno**. Puede cambiar set point, límite inferior y límite superior antes de confirmar. **Cancelar no calcula nada.**',
    acciones: [
      'Baje hasta Análisis de telemetría.',
      'Revise set point, límite inferior y límite superior.',
      'Pulse Analizar este mes y después Analizar con este rango.',
    ],
    marcos: [{ top: 24, left: 27, width: 46, height: 46, etiqueta: 'Confirmar el rango y analizar' }],
  },
  {
    id: 'analisis',
    titulo: 'Análisis de telemetría · cómo leerlo',
    imagen: 'analisis.png',
    texto:
      'El análisis separa las horas **fuera de rango**, **apagado** y **defrost**. **Un defrost corto no se cuenta como fuera de rango.** Si el defrost pasa de 2 horas, sí se atiende como fuera de rango. **Filtrar sin DEFROST** deja solo lo que hay que atender. PDF, CSV y Excel bajan este resultado.',
    acciones: [
      'Mire primero las horas Fuera, Apagado y DEFROST de la semana.',
      'En Eventos, el rojo es fuera de rango y el azul es DEFROST.',
      'Actualizar vuelve a calcular el mes con el rango que está en pantalla.',
    ],
    marcos: [{ top: 27, left: 3, width: 94, height: 70, etiqueta: 'Semanas y eventos' }],
  },
  {
    id: 'informes',
    titulo: 'Generador de informes',
    imagen: 'informes.png',
    texto:
      'El informe de cadena de frío usa el historial oficial y **solo deja elegir equipos de esta cuenta**. Busque por nombre, IMEI o código. Si el equipo ya tiene nombre, el formulario lo usa. La banda de cumplimiento es **set ± tolerancia en el retorno**. **Defrost y arranque quedan fuera** de ese porcentaje.',
    acciones: [
      'Busque el equipo y púlselo en la lista.',
      'Si el equipo está sin asignar, escriba el nombre del informe. Si ya tiene nombre, el formulario lo toma.',
      'Fije desde, hasta, idioma y tolerancia.',
      'Generar informe arma el documento. No lo pulse hasta tener el nombre y las fechas.',
    ],
    marcos: [{ top: 13.8, left: 36.7, width: 40.5, height: 40, etiqueta: 'Equipo, nombre, fechas y tolerancia' }],
  },
  {
    id: 'alarmas',
    titulo: 'Alarmas',
    imagen: 'alarmas.png',
    texto:
      'Alarmas lista los eventos que el equipo reporta con numero_alarma distinto de 0, enlazados al catálogo MP4000. En esta cuenta, el 26/11/2026, no hay ninguna: 0 activas, 0 registradas, 0 atendidas, 0 por atender. Cuando un equipo reporte un código, la fila trae estado, IMEI, equipo, código, texto técnico, hora de detección y si ya se atendió. El botón Catálogo abre el significado de cada código.',
    acciones: [
      'Mire **Activas ahora** para lo que sigue sonando.',
      '**Por atender** son las que nadie marcó.',
      'Actualizar vuelve a leer la telemetría.',
    ],
    marcos: [{ top: 12.5, left: 15.1, width: 83.7, height: 11.8, etiqueta: 'Activas, registradas, atendidas y por atender' }],
  },
  {
    id: 'catalogo',
    titulo: 'Catálogo de alarmas',
    imagen: 'catalogo.png',
    texto:
      'El catálogo MP4000 traduce el código numérico al mensaje que ve el usuario. El código del equipo se busca en esta tabla. El lápiz edita el mensaje. **No borre una alarma que los equipos todavía reportan.**',
    acciones: [
      'Busque por código, mensaje o título.',
      'El mensaje al usuario es el texto simple. El título técnico es la ficha.',
      'Estado Activa significa que el código se puede enlazar.',
    ],
    marcos: [{ top: 16, left: 17, width: 76, height: 72, etiqueta: 'Código, mensaje y estado' }],
  },
  {
    id: 'usuarios',
    titulo: 'Crear un usuario · dónde',
    imagen: 'usuarios.png',
    texto:
      '**+ Nuevo usuario** abre el formulario. El lápiz edita y la papelera elimina. **Los equipos no se escriben en esta tabla:** se asignan en Administración. Esta pantalla es de monitoreo admin y **no incluye las funciones de superadmin**.',
    acciones: [
      'Entre a Usuarios.',
      'Pulse + Nuevo usuario.',
      'Para revisar una cuenta ya creada, use el lápiz.',
    ],
    marcos: [
      { top: 7, left: 90.4, width: 8.5, height: 3.4, etiqueta: 'Nuevo usuario' },
      { top: 22.2, left: 16.5, width: 81, height: 4.6, etiqueta: 'Cuenta guia.monitoreo' },
    ],
  },
  {
    id: 'nuevo-usuario',
    titulo: 'Crear un usuario · el formulario',
    imagen: 'nuevo-usuario.png',
    texto:
      'El formulario pide **usuario y contraseña**. El WhatsApp lleva prefijo **51**. Rol **Monitoreo** para quien vigila, **Administrador** para quien configura, **Solo Vista** para quien no cambia nada. **Análisis de telemetría** muestra el panel de defrost y horas fuera de rango. **Guardar** crea la cuenta. **Cancelar** no guarda nada. Los equipos se asignan después.',
    acciones: [
      'Escriba usuario, contraseña y el WhatsApp con 51.',
      'Elija rol Monitoreo y la categoría que corresponda.',
      'Marque Análisis de telemetría si debe ver defrost y horas fuera de rango.',
      'Guardar crea la cuenta. Los equipos se asignan después, en Administración.',
    ],
    marcos: [
      { top: 22, left: 37.2, width: 25.5, height: 28, etiqueta: 'Credenciales y WhatsApp' },
      { top: 68.8, left: 37.5, width: 25, height: 10, etiqueta: 'Análisis de telemetría' },
    ],
  },
  {
    id: 'asignar',
    titulo: 'Asignar los dispositivos',
    imagen: 'asignaciones.png',
    texto:
      'En **Administración → Asignaciones** un admin solo ve las cuentas que él creó. A la derecha se marcan los equipos. **El mismo IMEI en TUNEL, STARCOOL y THERMOKING son equipos distintos:** marque la fila del código que corresponde. **Guardar asignación** graba.',
    acciones: [
      'Busque al usuario en la columna izquierda y púlselo.',
      'A la derecha marque cada equipo. Mire el código (TUNEL, STARCOOL, STARCOOL2, TERMOKING) además del IMEI.',
      'Revise la fecha de acceso.',
      'Pulse Guardar asignación solo cuando la lista del centro sea la que quiere dejar.',
    ],
    marcos: [
      { top: 17, left: 15.1, width: 20.5, height: 14.6, etiqueta: '1. Elija la cuenta' },
      { top: 17, left: 36.2, width: 27.5, height: 15.6, etiqueta: '2. Lo que ya tiene' },
      { top: 17, left: 64.3, width: 34.5, height: 15.6, etiqueta: '3. Marque equipos y guarde' },
    ],
  },
  {
    id: 'correo',
    titulo: 'Correo · abrir un grupo',
    imagen: 'correo.png',
    texto:
      'Correo y alertas envía **solo a los equipos de esta cuenta**. Un admin puede tener hasta **2 grupos** y **3 correos** por grupo. **+ Nuevo grupo** abre el formulario. **No use Ejecutar ahora:** dispara el ciclo real de envío.',
    acciones: [
      'Entre a Correo.',
      'Pulse + Nuevo grupo.',
      'Equipos muestra la flota disponible. No envía nada.',
    ],
    marcos: [{ top: 16, left: 78, width: 16, height: 6, etiqueta: 'Nuevo grupo' }],
  },
  {
    id: 'correo-grupo',
    titulo: 'Correo · destinatarios, WhatsApp y equipos',
    imagen: 'correo-grupo.png',
    texto:
      'El nombre del grupo y el cliente salen en el saludo. Los destinatarios se confirman con **Agregar**, **máximo 3**. El recuadro de WhatsApp avisa por WhatsApp solo si el número ya está **probado o aprobado**. Cada equipo muestra **ONLINE, WAIT u OFFLINE**. Si el ID Reefer va vacío, se usa el nombre del listado. **Crear grupo** guarda. **Cancelar** descarta el formulario.',
    acciones: [
      'Escriba el nombre, el cliente y los correos. Pulse Agregar.',
      'Marque WhatsApp solo si esos números ya están aprobados.',
      'Pulse el + de cada equipo que debe entrar.',
      'Revise el ID Reefer y las horas marcadas.',
      'Crear grupo guarda. Cancelar descarta el formulario.',
    ],
    marcos: [
      { top: 8, left: 20, width: 58, height: 22, etiqueta: 'Nombre, correos y WhatsApp' },
      { top: 48, left: 20, width: 58, height: 38, etiqueta: 'Equipo, ID Reefer y horas' },
    ],
  },
];

function partesConNegrita(texto: string) {
  return texto.split(/(\*\*[^*]+\*\*)/g).filter((parte) => parte.length > 0);
}

function TextoRico({ texto }: { texto: string }) {
  return (
    <>
      {partesConNegrita(texto).map((parte, i) =>
        parte.startsWith('**') && parte.endsWith('**') ? (
          <strong key={i} className="font-semibold text-slate-900">
            {parte.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{parte}</span>
        ),
      )}
    </>
  );
}

function Captura({
  paso,
  onMarco,
}: {
  paso: Paso;
  onMarco?: () => void;
}) {
  return (
    <div className="relative">
      <img
        src={`${base}guia/${paso.imagen}?v=5`}
        alt={paso.titulo}
        className="block w-full h-auto rounded-md border bg-white"
      />
      {paso.marcos.map((marco) => (
        <div
          key={`${paso.id}-${marco.etiqueta}`}
          role={onMarco ? 'button' : undefined}
          tabIndex={onMarco ? 0 : undefined}
          onClick={onMarco}
          onKeyDown={
            onMarco
              ? (event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onMarco();
                  }
                }
              : undefined
          }
          className="marco-guia absolute cursor-pointer rounded-md border-2 border-sky-800 bg-transparent text-left"
          style={{
            top: `${marco.top}%`,
            left: `${marco.left}%`,
            width: `${marco.width}%`,
            height: `${marco.height}%`,
            background: 'transparent',
            backgroundColor: 'transparent',
          }}
        >
          <span className="absolute left-2 top-0 -translate-y-1/2 rounded bg-sky-800 px-2 py-0.5 text-[11px] font-medium leading-4 text-white shadow">
            {marco.etiqueta}
          </span>
        </div>
      ))}
    </div>
  );
}

function Cuerpo({ paso }: { paso: Paso }) {
  return (
    <div className="space-y-3">
      <h2 className="text-xl font-semibold">{paso.titulo}</h2>
      <p className="text-sm leading-6 text-slate-700">
        <TextoRico texto={paso.texto} />
      </p>
      <ol className="list-decimal space-y-1 pl-5 text-sm leading-6 text-slate-800">
        {paso.acciones.map((accion) => (
          <li key={accion}>
            <TextoRico texto={accion} />
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function ManualPlataforma() {
  const [indice, setIndice] = useState(0);
  const paso = PASOS[indice];
  const ir = (siguiente: number) => {
    setIndice(Math.min(PASOS.length - 1, Math.max(0, siguiente)));
  };

  return (
    <div>
      <style>{`
        .marco-guia { background: transparent !important; background-color: transparent !important; }
        .impresion { display: none; }
        @media print {
          @page { margin: 12mm; }
          .no-print { display: none !important; }
          .solo-pantalla { display: none !important; }
          .impresion { display: block !important; }
          .marco-guia {
            background: transparent !important;
            background-color: transparent !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .marco-guia span {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .paso-impreso {
            break-before: page;
            page-break-before: always;
            break-inside: auto;
            page-break-inside: auto;
          }
          .paso-impreso:first-of-type {
            break-before: auto;
            page-break-before: auto;
          }
          .impresion img {
            width: 100% !important;
            height: auto !important;
          }
        }
      `}</style>

      <div className="no-print mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Guía de la plataforma</p>
          <h1 className="text-2xl font-semibold">Manual con la interfaz real</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Capturas del 26/11/2026 con la cuenta guia.monitoreo (monitoreo admin).
            Incluye inicio, listado, detalle, informes, alarmas, usuarios, asignación de equipos y correo.
            El recuadro marca la zona. Pulsarlo pasa al siguiente paso.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => window.print()}>
          <Download className="mr-2 h-4 w-4" />
          Descargar PDF
        </Button>
      </div>

      <div className="solo-pantalla grid items-start gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
        <ol className="no-print space-y-1 lg:sticky lg:top-4 lg:max-h-[calc(100vh-8rem)] lg:overflow-auto">
          {PASOS.map((item, i) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => ir(i)}
                className={cn(
                  'w-full rounded-md px-2 py-1.5 text-left text-sm',
                  i === indice ? 'bg-sky-800 text-white' : 'hover:bg-slate-100',
                )}
              >
                <span className="mr-2 tabular-nums text-xs opacity-70">{i + 1}</span>
                {item.titulo}
              </button>
            </li>
          ))}
        </ol>

        <section className="space-y-4">
          <p className="text-xs text-slate-500">
            {indice + 1} / {PASOS.length}
          </p>
          <Cuerpo paso={paso} />
          <Captura paso={paso} onMarco={() => ir(indice + 1)} />
          <div className="no-print flex gap-2">
            <Button type="button" variant="outline" onClick={() => ir(indice - 1)} disabled={indice === 0}>
              Anterior
            </Button>
            <Button type="button" onClick={() => ir(indice + 1)} disabled={indice === PASOS.length - 1}>
              Siguiente
            </Button>
          </div>
        </section>
      </div>

      <div className="impresion space-y-8">
        <h1 className="text-2xl font-semibold">Guía básica de ZTRACK</h1>
        <p className="text-sm">
          Guía básica para las funcionalidades operativas de ZTRACK.
        </p>
        {PASOS.map((item, i) => (
          <section key={item.id} className="paso-impreso space-y-3">
            <p className="text-xs text-slate-500">
              {i + 1} / {PASOS.length}
            </p>
            <Cuerpo paso={item} />
            <Captura paso={item} />
          </section>
        ))}
      </div>
    </div>
  );
}
