/** Erro com mensagem própria para quem usa o sistema. O `status` é o HTTP que a rota devolve. */
export class ErroSdrCore extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = "ErroSdrCore";
  }
}
