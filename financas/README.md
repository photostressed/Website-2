# Finanças

App pessoal de controlo financeiro: **entradas**, **impostos** e **saídas** (casa, contas, comida, etc.).
Pensada para trabalhador independente em Portugal (IVA, retenção de IRS e Segurança Social).

## O que faz

- **Trabalhos**: cada pedido de cliente da fase *Pedido* até *Entregue*, marcado como **pago** ou **por pagar**. Ao marcar como pago, a entrada é criada sozinha em Movimentos. Trabalhos feitos há mais de 30 dias e por pagar aparecem em atraso.
- **Em conta / Por receber**: no topo do Resumo e dos Trabalhos, o dinheiro que já tens na conta, o que os clientes ainda te devem e o total. Define o saldo inicial da conta em Definições.
- **Resumo**: recebido, despesas, impostos pagos e saldo do mês ou do ano. Inclui um gráfico mês a mês e as despesas por categoria.
- **Reservar para impostos**: quanto IVA e Segurança Social ainda tens de pagar e quanto fica realmente livre.
- **Movimentos**: lista com pesquisa e filtro por tipo, para editar, duplicar ou apagar.
- **Despesas fixas**: renda, contas e subscrições lançadas sozinhas todos os meses no dia escolhido (podem ter fim, ser pausadas e retomadas).
- **Impostos**: tabela anual mês a mês e IVA por trimestre.
- **Personalização**: tema claro/escuro, cor de destaque, nome da app, o que mostrar ao abrir e categorias (mudar nome, ordenar, criar, apagar).
- **Definições**: taxas por omissão (IVA, IRS, SS), cópia de segurança (.json) e exportação para Excel/Numbers (.csv).

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
npm run mac        # cria Financas.app em dist/mac-arm64 (aparece como “Finanças”)
```

Copia a `Financas.app` para a pasta Aplicações. Como não está assinada pela Apple, abre-a da primeira vez
com **clique direito → Abrir**, ou autoriza em Definições do Sistema → Privacidade e Segurança.

## Bloqueio com impressão digital (Touch ID)

Em *Personalização → Segurança* ativa **Pedir impressão digital para abrir a app**. A partir daí a app pede
o Touch ID ao abrir e volta a pedir sempre que o Mac bloqueia ou adormece.

Se algum dia ficares sem Touch ID (por exemplo, MacBook fechado com teclado externo), desativa o bloqueio no Terminal:

```bash
rm ~/Library/Application\ Support/Financas/config.json
```

## Onde ficam os dados

Ficam só no teu Mac, sem servidores nem contas: em `~/Library/Application Support/Financas/` na app,
ou no armazenamento do browser se abrires o `index.html`. Faz de vez em quando
*Definições → Exportar cópia de segurança*.

> Os cálculos de impostos são estimativas para te ajudar a reservar dinheiro. Confirma sempre com o teu contabilista.
