import { PDFDocument, StandardFonts } from "pdf-lib";
import { formatarCnpj, formatarCpf } from "@/lib/documentos";
import { dadosDoDesenvolvedor } from "@/lib/rep-arquivos";

/**
 * Atestado Técnico e Termo de Responsabilidade (Portaria 671, art. 89),
 * preenchido conforme o modelo publicado no portal gov.br.
 *
 * O documento sai SEM assinatura: o § 2º exige assinatura eletrônica
 * qualificada (ICP-Brasil) "pertencente exclusivamente à pessoa física", do
 * responsável técnico e do responsável legal da Dilon Tech. Cada um assina o
 * PDF com o próprio e-CPF (PAdES, § 3º) num assinador ICP-Brasil, e o PDF
 * assinado é entregue ao cliente, que o guarda para a fiscalização (§ 4º: só
 * pode usar o sistema tendo esse documento).
 */
export interface Signatario {
  nome: string;
  cpf: string;
}

export async function gerarAtrt(opcoes: {
  tipo: "REP-P" | "PTRP";
  destinataria: { razaoSocial: string; cnpj: string };
  responsavelLegal: Signatario;
  responsavelTecnico: Signatario;
  certificadoInpi: string;
}): Promise<Buffer> {
  const dev = dadosDoDesenvolvedor();
  const doc = await PDFDocument.create();
  doc.setTitle(`Atestado Técnico e Termo de Responsabilidade - ${opcoes.tipo}`);
  doc.setProducer("Dilon Ponto");
  const pagina = doc.addPage([595, 842]);
  const fonte = await doc.embedFont(StandardFonts.Helvetica);
  const negrito = await doc.embedFont(StandardFonts.HelveticaBold);
  let y = 780;
  const paragrafo = (texto: string, tamanho = 10.5, f = fonte) => {
    const palavras = texto.split(" ");
    let linha = "";
    for (const p of palavras) {
      const teste = linha ? `${linha} ${p}` : p;
      if (f.widthOfTextAtSize(teste, tamanho) > 515) {
        pagina.drawText(linha, { x: 40, y, size: tamanho, font: f });
        y -= tamanho + 5;
        linha = p;
      } else linha = teste;
    }
    if (linha) pagina.drawText(linha, { x: 40, y, size: tamanho, font: f });
    y -= tamanho + 9;
  };
  const campo = (rotulo: string, valor: string) => {
    pagina.drawText(`${rotulo}:`, { x: 40, y, size: 10.5, font: negrito });
    pagina.drawText(valor, { x: 40 + negrito.widthOfTextAtSize(`${rotulo}: `, 10.5), y, size: 10.5, font: fonte });
    y -= 17;
  };

  const titulo = "ATESTADO TÉCNICO E TERMO DE RESPONSABILIDADE";
  pagina.drawText(titulo, { x: (595 - negrito.widthOfTextAtSize(titulo, 13)) / 2, y, size: 13, font: negrito });
  y -= 36;
  paragrafo(
    `Na qualidade de responsável técnico e de responsável legal da empresa ${dev.razaoSocial}, (CNPJ nº ${formatarCnpj(dev.cnpj)}), os signatários abaixo, em atenção ao art. 89 da Portaria MTP nº 671/2021, atestam e declaram que o equipamento e/ou programa identificados abaixo estão em conformidade com a Portaria MTP nº 671/2021.`,
  );
  y -= 6;
  campo("Tipo do REP/PTRP", opcoes.tipo);
  campo("Marca Equipamento", "N/A");
  campo("Modelo Equipamento", "N/A");
  campo("Certificado de conformidade", "N/A");
  campo("Número de fabricação", "N/A");
  campo("Número de registro no INPI", opcoes.tipo === "REP-P" ? dev.registroInpi : "N/A");
  campo("Certificado de registro de programa de computador no INPI", opcoes.certificadoInpi || "N/A");
  campo("Identificador do Programa", dev.nomePrograma);
  campo("Versão do Programa", dev.versao);
  y -= 6;
  // O bloco de assinatura eletrônica do modelo é "somente REP-C".
  campo("Assinatura Eletrônica", "N/A (somente REP-C)");
  campo("Chave pública", "N/A");
  campo("Algoritmo de criptografia assimétrica", "N/A");
  campo("Algoritmo de hash", "N/A");
  y -= 6;
  paragrafo(
    "Declaramos ainda, que estamos cientes das consequências legais, cíveis e criminais, quanto à falsa declaração, falso atestado e falsidade ideológica. Reiteramos ao usuário que este documento deve ficar disponível para pronta apresentação para a Inspeção do Trabalho.",
  );
  y -= 6;
  pagina.drawText("Empresa/Pessoa Destinatária:", { x: 40, y, size: 10.5, font: negrito });
  y -= 17;
  campo("Razão Social", opcoes.destinataria.razaoSocial);
  campo("CNPJ/CPF", formatarCnpj(opcoes.destinataria.cnpj));
  y -= 40;
  for (const [s, papel] of [
    [opcoes.responsavelLegal, "Responsável Legal"],
    [opcoes.responsavelTecnico, "Responsável Técnico"],
  ] as const) {
    pagina.drawLine({ start: { x: 150, y }, end: { x: 445, y }, thickness: 0.6 });
    y -= 14;
    const texto = `${s.nome}, CPF ${formatarCpf(s.cpf)} (${papel})`;
    pagina.drawText(texto, { x: (595 - fonte.widthOfTextAtSize(texto, 10)) / 2, y, size: 10, font: fonte });
    y -= 50;
  }
  pagina.drawText("Documento a ser assinado digitalmente (ICP-Brasil, padrão PAdES) pelos dois signatários.", { x: 40, y: 40, size: 8, font: fonte });
  return Buffer.from(await doc.save());
}
