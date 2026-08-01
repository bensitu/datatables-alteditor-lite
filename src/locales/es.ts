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
    removeMessage: 'Confirma que deseas eliminar las filas seleccionadas.',
  },
  validation: {
    required: 'Este campo es obligatorio.',
    invalid: 'Introduce un valor válido.',
    unique: 'Introduce un valor único.',
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
