# API de anúncios FiveM no Postman

A API roda junto com o bot em `http://127.0.0.1:3001` e grava os dados em `data/anuncios_fivem.json`. As alterações também são publicadas no canal FiveM do Discord.

## Configuração

No arquivo `.env`, defina uma chave privada para a API:

```env
API_KEY=COLOQUE_UMA_CHAVE_LONGA_E_ALEATORIA
API_PORT=3001
```

Reinicie o bot depois de configurar. A API aceita conexões apenas do próprio computador (`127.0.0.1`).

No Postman, em **Authorization**, escolha **Bearer Token** e informe o valor de `API_KEY`.

## Rotas

| Método | URL | Ação |
|---|---|---|
| `GET` | `http://127.0.0.1:3001/api/anuncios/fivem` | Lista os anúncios |
| `GET` | `http://127.0.0.1:3001/api/anuncios/fivem/ID` | Consulta um anúncio |
| `POST` | `http://127.0.0.1:3001/api/anuncios/fivem` | Cadastra e publica |
| `PUT` | `http://127.0.0.1:3001/api/anuncios/fivem/ID` | Atualiza a mensagem publicada |
| `DELETE` | `http://127.0.0.1:3001/api/anuncios/fivem/ID` | Remove a mensagem e o registro |

Para `POST` e `PUT`, selecione **Body → raw → JSON**:

```json
{
  "titulo": "Novo anúncio FiveM",
  "texto": "Texto do anúncio. Links também são aceitos."
}
```

O `POST` responde com o anúncio criado e seu `id`; use esse `id` nas rotas `PUT` e `DELETE`. Título aceita até 100 caracteres e texto até 1800. Menções como `@everyone` são enviadas sem notificar os membros.
