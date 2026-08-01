import type { AltEditorLiteLanguage } from '../core/alt-editor-lite-language.js';

/**
 * Complete Spanish locale.
 */
export const es: Readonly<AltEditorLiteLanguage> = {
  locale: 'es',
  actions: {
    create: 'Crear',
    edit: 'Editar',
    remove: 'Eliminar',
    refresh: 'Actualizar',
    submit: 'Enviar',
    cancel: 'Cancelar',
    close: 'Cerrar',
  },
  dialog: {
    createTitle: 'Crear fila',
    editTitle: 'Editar fila',
    removeTitle: 'Eliminar filas',
    removeCount: 'Filas seleccionadas: {count}.',
    removeMessage: 'Confirma que deseas eliminar las filas seleccionadas.',
  },
  buttons: {
    createUnavailable: 'Configura una operación de creación para habilitar esta acción.',
    selectUnavailable: 'Esta acción requiere DataTables Select.',
    busy: 'El editor está ocupado.',
    editSelection: 'Selecciona exactamente una fila para editarla.',
    removeSelection: 'Selecciona una o más filas para eliminarlas.',
    initialize: 'Inicializa AltEditorLite para usar esta acción.',
  },
  validation: {
    required: 'Este campo es obligatorio.',
    invalid: 'Introduce un valor válido.',
    unique: 'El mismo valor ya existe en los datos cargados actualmente.',
  },
  searchSelect: {
    placeholder: 'Selecciona una opción',
    searchPlaceholder: 'Buscar opciones',
    noResults: 'No hay opciones coincidentes',
    clear: 'Borrar selección',
  },
  accessibility: {
    searchSelectInstructions: 'Usa las flechas para recorrer las opciones.',
    searchSelectResults: 'Hay {count} opciones disponibles.',
    searchSelectSelection: 'Se ha seleccionado {label}.',
  },
  errors: {
    generic: 'No se pudo completar la operación.',
    fileCount: 'Se seleccionaron demasiados archivos.',
    fileSize: 'Uno de los archivos seleccionados es demasiado grande.',
    selectionRequired: 'Selecciona al menos una fila.',
    singleSelectionRequired: 'Selecciona exactamente una fila.',
    targetUnavailable: 'La fila seleccionada ya no está disponible.',
  },
};

export default es;
