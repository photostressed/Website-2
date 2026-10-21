# Legendas

App de Mac que cria legendas **.srt** a partir de um vídeo ou áudio, para importar no **DaVinci Resolve**.
O reconhecimento de voz (Whisper large-v3-turbo) corre **no próprio Mac**: os vídeos não saem do computador.

- **Português** → legendas em português.
- **Inglês → Português** → transcreve em inglês e traduz com o DeepL (português de Portugal).
- **Inglês** → legendas em inglês.

Depois de criar, há um editor com o vídeo ao lado para corrigir o texto e os tempos, juntar ou dividir
legendas e substituir palavras em todas de uma vez. Por fim, **Guardar .srt**.

## Preparação (uma vez)

No Terminal:

```bash
# Homebrew, se ainda não tiveres
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# ffmpeg (extrai o áudio) e whisper.cpp (reconhecimento de voz)
brew install ffmpeg whisper-cpp
```

O modelo (cerca de 1,6 GB) é descarregado dentro da app, no primeiro arranque.

Para traduzir de inglês, cria uma conta gratuita em <https://www.deepl.com/pro-api> e cola a chave na app
(fica guardada no Porta-chaves do Mac).

## Instalar a app

```bash
cd legendas
npm install
npm run mac
cp -R dist/mac-arm64/Legendas.app /Applications/
open /Applications/Legendas.app
```

## Usar com o DaVinci Resolve

1. Para os tempos baterem certo com a montagem, exporta da timeline o **áudio** (Deliver → só áudio, WAV)
   ou o vídeo final, e usa esse ficheiro na app.
2. Na app: arrasta o ficheiro, escolhe a língua e carrega em **Criar legendas**. Revê e **Guardar .srt**.
3. No DaVinci: **File → Import → Subtitle…**, escolhe o .srt e arrasta-o do Media Pool para o início da timeline.

Dica: em "Nomes e palavras difíceis" escreve nomes de pessoas, locais e marcas que aparecem no vídeo
(ex.: *Photostressed, Quinta da Aveleda, Ana e Rui*). O Whisper passa a escrevê-los bem.
