from __future__ import annotations


COURSE_PROMPTS: dict[str, str] = {
    "text_lesson": (
        "Estou estudando este conteudo de um curso online. Explique em portugues, "
        "de forma clara e passo a passo, os conceitos principais do recorte. "
        "Organize por topicos, destaque termos importantes, exemplos praticos e "
        "possiveis pegadinhas. Se parecer conteudo de avaliacao, nao me de apenas "
        "uma resposta final; me ajude a entender o raciocinio."
    ),
    "video": (
        "Estou assistindo a uma videoaula. A partir deste trecho/transcricao/anotacao, "
        "gere um resumo objetivo, explique os conceitos principais, liste os pontos "
        "que eu preciso memorizar e crie perguntas de revisao para fixacao."
    ),
    "activity": (
        "Estou fazendo uma atividade de estudo. Me ajude a entender o que a questao "
        "esta cobrando. Nao responda apenas com a alternativa final. Explique o "
        "conceito, o raciocinio e como eu chegaria na resposta corretamente."
    ),
    "quick_review": (
        "Transforme este conteudo em uma revisao rapida para prova, com topicos "
        "essenciais, termos-chave, exemplos e 5 perguntas para eu testar meu entendimento."
    ),
    "executive_summary": (
        "Resuma este conteudo em ate 10 linhas, mantendo os conceitos tecnicos mais "
        "importantes e explicando de forma simples."
    ),
    "glossary": (
        "Extraia os termos tecnicos deste conteudo e crie um glossario com explicacoes "
        "curtas e exemplos."
    ),
    "step_by_step": (
        "Explique este conteudo passo a passo, conectando os conceitos entre si, "
        "mostrando exemplos praticos e apontando o que costuma confundir estudantes."
    ),
    "review_questions": (
        "Crie perguntas de revisao sobre este conteudo. Misture perguntas conceituais, "
        "praticas e de verificacao. Inclua gabarito comentado, mas foque no raciocinio."
    ),
    "flashcards": (
        "Transforme este conteudo em flashcards no formato Pergunta | Resposta. "
        "Use respostas curtas, tecnicas e faceis de revisar."
    ),
    "video_checklist": (
        "Crie um checklist de estudo para este trecho de video, com pontos a assistir, "
        "conceitos a anotar e itens para revisar depois."
    ),
}


PROMPT_LABELS: dict[str, str] = {
    "text_lesson": "Aula em texto",
    "video": "Videoaula",
    "activity": "Atividade",
    "quick_review": "Revisao rapida",
    "executive_summary": "Resumo executivo",
    "glossary": "Glossario",
    "step_by_step": "Passo a passo",
    "review_questions": "Perguntas de revisao",
    "flashcards": "Flashcards",
    "video_checklist": "Checklist do video",
}
