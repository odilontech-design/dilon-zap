import assert from "node:assert/strict";
import { resumoDoErro } from "./grade-portais-filtros";

const casos: [string, string][] = [
  ["Falta para anunciar: Conferir a quilometragem: 1 km num carro de 2015 parece número padrão", "Corrigir a km"],
  ["Falta para anunciar: O NaPista exige a quilometragem do carro: informe a km real (Veículos > Completar)", "Corrigir a km"],
  ['O NaPista respondeu 400: mileage: must be greater than 0', "Corrigir a km"],
  ["Falta para anunciar: O NaPista não reconheceu a cor do carro: confira a cor na ficha", "Cor não reconhecida"],
  ["Falta para anunciar: Marca, modelo e versão não identificadas no catálogo da Webmotors", "Versão não identificada"],
  ["Falta para anunciar: pelo menos 1 foto", "Faltam fotos"],
  ["Falta para anunciar: Escolher a modalidade (plano do anúncio) na Webmotors, em Veículos → Portais", "Escolher o plano"],
  ["O portal respondeu 401: token expirado", "Reconectar o portal"],
  ["Tempo esgotado ao falar com o servidor do portal; tentaremos de novo", "Tempo esgotado ao falar com o s…"],
  ["", "Erro no portal"],
];
for (const [erro, esperado] of casos) assert.equal(resumoDoErro(erro), esperado, erro);
console.log(`ok    ${casos.length} erros resumidos\n\ntudo certo`);
