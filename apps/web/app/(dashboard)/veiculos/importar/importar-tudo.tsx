"use client";

import { useState } from "react";
import { ImportarDoSite } from "./importar-do-site";
import { ImportarEstoque } from "./importar-estoque";
import { SecaoFotos, useFotosDaImportacao } from "./fotos-da-importacao";

/**
 * A página de importação: trazer do site atual ou enviar uma planilha. As
 * duas deixam as fotos na mesma fila, e o download (com a barra de progresso)
 * é uma seção só, no fim.
 */
export function ImportarTudo() {
  const [erro, setErro] = useState<string | null>(null);
  const { fotos, baixarFotos, pausar } = useFotosDaImportacao(setErro);
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      <ImportarDoSite onFotos={baixarFotos} />
      <div>
        <h2 className="mb-3 text-sm font-semibold text-neutral-500">Ou envie uma planilha</h2>
        <ImportarEstoque onFotos={baixarFotos} />
      </div>
      {erro && <p className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-600">{erro}</p>}
      <SecaoFotos titulo="Fotos dos carros" fotos={fotos} baixarFotos={baixarFotos} pausar={pausar} />
    </div>
  );
}
