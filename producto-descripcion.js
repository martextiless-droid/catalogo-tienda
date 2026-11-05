(() => {
  const MARCADOR_NEGRITA = /(\*\*?)([^\n]+?)\1/g;

  window.renderizarDescripcion = (elemento, descripcion) => {
    if (!elemento) return;

    const texto = String(descripcion ?? "");
    const fragmento = document.createDocumentFragment();
    let cursor = 0;

    for (const coincidencia of texto.matchAll(MARCADOR_NEGRITA)) {
      const inicio = coincidencia.index ?? cursor;
      fragmento.appendChild(document.createTextNode(texto.slice(cursor, inicio)));

      const negrita = document.createElement("strong");
      negrita.textContent = coincidencia[2];
      fragmento.appendChild(negrita);
      cursor = inicio + coincidencia[0].length;
    }

    fragmento.appendChild(document.createTextNode(texto.slice(cursor)));
    elemento.replaceChildren(fragmento);
  };
})();
