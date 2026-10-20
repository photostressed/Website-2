# Finanças

App pessoal de controlo financeiro: **entradas**, **impostos** e **saídas** (casa, contas, comida, etc.).
Pensada para trabalhador independente em Portugal (IVA, retenção de IRS e Segurança Social).

## O que faz

- **Resumo**: recebido, despesas, impostos pagos e saldo do mês ou do ano. Inclui um gráfico mês a mês e as despesas por categoria.
- **Reservar para impostos**: quanto IVA e Segurança Social ainda tens de pagar e quanto fica realmente livre.
- **Movimentos**: lista com pesquisa e filtro por tipo, para editar, duplicar ou apagar.
- **Impostos**: tabela anual mês a mês e IVA por trimestre.
- **Definições**: taxas por omissão (IVA, IRS, SS), categorias, cópia de segurança (.json) e exportação para Excel/Numbers (.csv).

Numa **entrada** escreves o valor sem IVA. A app calcula o IVA, a retenção de IRS e quanto entra na conta.
Numa **saída** ou num **imposto** escreves o valor total pago.

## Experimentar já (sem instalar nada)

Abre `app/index.html` no Safari ou no Chrome. Os dados ficam guardados nesse browser.

## Correr como app no Mac

Precisas do [Node.js](https://nodejs.org) (versão LTS).

```bash
cd financas
npm install
npm start          # abre a app numa janela
npm run mac        # cria Finanças.app em dist/mac-arm64 (e dist/mac para Intel)
```

Copia a `Finanças.app` para a pasta Aplicações. Como não está assinada pela Apple, abre-a da primeira vez
com **clique direito → Abrir**, ou autoriza em Definições do Sistema → Privacidade e Segurança.

## Onde ficam os dados

Ficam só no teu Mac, sem servidores nem contas: em `~/Library/Application Support/Finanças/` na app,
ou no armazenamento do browser se abrires o `index.html`. Faz de vez em quando
*Definições → Exportar cópia de segurança*.

> Os cálculos de impostos são estimativas para te ajudar a reservar dinheiro. Confirma sempre com o teu contabilista.
