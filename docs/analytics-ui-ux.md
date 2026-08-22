# Analytics UI/UX

## Objetivo

Construir una experiencia de `Analytics` pensada para trader:

- lectura rapida,
- alta densidad de informacion,
- minimo ruido visual,
- confianza operativa,
- full width,
- prioridad al dato por encima de la decoracion.

No es una UI tipo portfolio. Es una mesa de trabajo moderna para seguimiento intradia.

## Principios

### 1. Minimalismo operativo

El minimalismo aqui no significa vacio. Significa:

- menos cajas innecesarias,
- menos sombras decorativas,
- menos colores compitiendo,
- menos texto explicativo en primera linea,
- mas jerarquia numerica.

### 2. Full width util

La vista debe usar practicamente todo el ancho disponible.

- Las bandas horizontales son preferibles a mosaicos pequeños.
- Las tablas deben respirar, pero no desperdiciar area.
- El trader debe ver varias señales al mismo tiempo sin navegar demasiado.

### 3. Jerarquia de lectura

Orden recomendado:

1. simbolo y timestamp,
2. ultimo precio y variacion,
3. liquidez y negociacion,
4. microestructura,
5. diagnostico,
6. tablas secundarias.

### 4. Color disciplinado

- fondo oscuro neutro,
- azul para estructura y foco,
- verde para sesgo positivo,
- rojo para sesgo negativo,
- amarillo solo para neutralidad o advertencia suave.

Los colores no se usan para decorar. Se usan para interpretar.

### 5. Tipografia de desk

- titulares y numeros: tipografia mas compacta y con presencia,
- labels: pequenos, en uppercase,
- texto secundario: gris suave,
- valores clave: contraste alto.

## Estructura visual

### Banda 1: Contexto superior

Debe mostrar:

- nombre de la vista,
- estado del core realtime,
- ultima sincronizacion,
- rango temporal visible,
- cantidad de simbolos y snapshots.

### Banda 2: Filtros

Debe concentrar:

- simbolos del core,
- simbolo puntual,
- filtros de fecha cuando apliquen.

No debe haber botones de recarga manual.

### Banda 3: Core tape

Por simbolo:

- ultimo precio,
- variacion dia,
- vwap acumulado,
- valor negociado.

### Banda 4: Microestructura

Por simbolo:

- spread bps,
- obi l1,
- obi top 5,
- microprice,
- mejor compra / mejor venta.

### Banda 5: Diagnostico

Debe traducir señales cuantitativas en lectura accionable:

- tactico,
- alertas.

### Banda 6: Data secundaria

- z-score opportunities,
- daily closing snapshots.

Estas vistas mantienen la misma grilla visual, pero con prioridad a tabla.

## Decisiones de interaccion

- El core se actualiza automaticamente.
- Las tabs no deben recargar la pagina completa.
- Los cambios de filtros deben reflejarse en el frame correspondiente.
- Las tablas secundarias no necesitan botones manuales si el filtro ya es suficiente.

## Que evitar

- glassmorphism pesado,
- cards flotando por todos lados,
- degradados brillantes,
- exceso de copy,
- botones de accion para tareas pasivas,
- modales innecesarios,
- layouts tipo dashboard generico.

## Regla de expansion

Toda nueva vista de analytics debe responder estas preguntas:

1. que decision toma el trader con este bloque,
2. cual es el dato dominante,
3. cual es el dato secundario,
4. se puede leer en menos de 3 segundos,
5. agrega señal o solo agrega ruido.
