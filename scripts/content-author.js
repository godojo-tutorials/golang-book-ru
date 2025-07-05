#!/usr/bin/env node

import { existsSync, mkdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { cwd } from 'node:process';
import chalk from 'chalk';
import ora from 'ora';
import boxen from 'boxen';
import inquirer from 'inquirer';
import slugify from 'slugify';
import { z } from 'zod';
import Handlebars from 'handlebars';

// === CONSTANTS ===
const CONFIG_FILE = 'content.config.json';
const AUTHOR_CONFIG_FILE = '.content-author-config.json';

// === ERROR CLASSES ===
class ContentAuthorError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'ContentAuthorError';
    this.code = code;
    this.details = details;
  }
}

class ConfigError extends ContentAuthorError {
  constructor(message, code, details) {
    super(message, code, details);
    this.name = 'ConfigError';
  }
}

class ValidationError extends ContentAuthorError {
  constructor(message, code, details) {
    super(message, code, details);
    this.name = 'ValidationError';
  }
}

class TemplateError extends ContentAuthorError {
  constructor(message, code, details) {
    super(message, code, details);
    this.name = 'TemplateError';
  }
}

// === SCHEMAS ===
const ConfigSchema = z.object({
  structure: z.object({
    defaultLanguage: z.string(),
    languages: z.array(z.string()).min(1)
  }),
  godojo: z.object({
    platform: z.string().optional(),
    apiEndpoint: z.string().optional()
  }),
  categories: z.array(z.object({
    slug: z.string(),
    titleRu: z.string(),
    titleEn: z.string().optional(),
    descriptionRu: z.string(),
    descriptionEn: z.string().optional(),
    modules: z.string(),
    difficulty: z.enum(['Beginner', 'Intermediate', 'Advanced']),
    estimatedHours: z.number().positive()
  })),
  quality: z.object({
    minWords: z.number().positive(),
    minCodeExamples: z.number().positive(),
    minExercises: z.number().positive()
  })
});

const AuthorConfigSchema = z.object({
  authorId: z.string(),
  username: z.string(),
  displayName: z.string(),
  email: z.string().email(),
  bio: z.string(),
  expertise: z.array(z.string()),
  socialLinks: z.object({
    github: z.string().nullable(),
    twitter: z.string().nullable(),
    website: z.string().nullable()
  }),
  language: z.string(),
  joinDate: z.string(),
  contentCreated: z.number(),
  contentHistory: z.array(z.object({
    id: z.string(),
    type: z.string(),
    title: z.string(),
    slug: z.string(),
    category: z.string(),
    files: z.array(z.string()),
    createdAt: z.string(),
    status: z.string()
  })),
  platform: z.string(),
  repository: z.string(),
  toolVersion: z.string()
});

// === CONFIG MANAGER ===
class ConfigManager {
  #config = null;
  #logger;

  constructor(logger = console) {
    this.#logger = logger;
  }

  async loadConfig(configPath = CONFIG_FILE) {
    if (!existsSync(configPath)) {
      throw new ConfigError(
          `Configuration file ${configPath} not found`,
          'CONFIG_NOT_FOUND',
          { configPath }
      );
    }

    try {
      const configContent = await readFile(configPath, 'utf8');
      const rawConfig = JSON.parse(configContent);
      this.#config = this.#validateConfig(rawConfig);
      return this.#config;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new ConfigError(
            `Invalid JSON in ${configPath}: ${error.message}`,
            'CONFIG_INVALID_JSON',
            { configPath, originalError: error.message }
        );
      }
      if (error instanceof z.ZodError) {
        throw new ValidationError(
            'Invalid configuration structure',
            'VALIDATION_SCHEMA_FAILED',
            { errors: error.errors }
        );
      }
      if (error instanceof ValidationError || error instanceof ConfigError) {
        throw error;
      }
      // Неожиданная ошибка
      throw new ConfigError(
          `Failed to load configuration: ${error.message}`,
          'CONFIG_LOAD_FAILED',
          { configPath, originalError: error.message }
      );
    }
  }

  #validateConfig(config) {
    return ConfigSchema.parse(config);
  }

  getConfig() {
    if (!this.#config) {
      throw new ConfigError('Configuration not loaded', 'CONFIG_NOT_LOADED');
    }
    return this.#config;
  }

  getLanguageConfig() {
    const config = this.getConfig();
    return {
      default: config.structure.defaultLanguage,
      supported: config.structure.languages
    };
  }

  getCategories() {
    return this.getConfig().categories;
  }

  getQualityStandards() {
    return this.getConfig().quality;
  }
}

// === AUTHOR MANAGER ===
class AuthorManager {
  #authorConfig = null;
  #configPath;
  #logger;

  constructor(configPath = AUTHOR_CONFIG_FILE, logger = console) {
    this.#configPath = configPath;
    this.#logger = logger;
  }

  async loadProfile() {
    if (!existsSync(this.#configPath)) {
      return null;
    }

    try {
      const content = await readFile(this.#configPath, 'utf8');
      const rawConfig = JSON.parse(content);
      this.#authorConfig = this.#validateProfile(rawConfig);
      return this.#authorConfig;
    } catch (error) {
      this.#logger.warn('Failed to load author profile, will create new one');
      return null;
    }
  }

  #validateProfile(profile) {
    return AuthorConfigSchema.parse(profile);
  }

  async saveProfile(profile) {
    try {
      const validatedProfile = this.#validateProfile(profile);
      await writeFile(
          this.#configPath,
          JSON.stringify(validatedProfile, null, 2)
      );
      this.#authorConfig = validatedProfile;
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ValidationError(
            'Invalid author profile structure',
            'VALIDATION_AUTHOR_FAILED',
            { errors: error.errors }
        );
      }
      throw new ConfigError(
          'Failed to save author profile',
          'AUTHOR_SAVE_FAILED',
          { originalError: error.message }
      );
    }
  }

  getProfile() {
    return this.#authorConfig;
  }

  generateAuthorId(username) {
    const timestamp = Date.now();
    const hash = this.#simpleHash(username + timestamp);
    return `author_${username}_${hash}`;
  }

  #simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).substring(0, 8);
  }

  async updateStats(contentType, contentDetails) {
    if (!this.#authorConfig) {
      throw new ConfigError('No author profile loaded', 'AUTHOR_NOT_LOADED');
    }

    this.#authorConfig.contentCreated++;
    this.#authorConfig.contentHistory.push({
      id: `content_${Date.now()}`,
      type: contentType,
      title: contentDetails.title,
      slug: contentDetails.slug,
      category: contentDetails.category,
      files: contentDetails.files,
      createdAt: new Date().toISOString(),
      status: 'created'
    });

    await this.saveProfile(this.#authorConfig);
  }
}

// === TEMPLATE MANAGER ===
class TemplateManager {
  #templates = new Map();
  #logger;

  constructor(logger = console) {
    this.#logger = logger;
    this.#initializeTemplates();
  }

  #initializeTemplates() {
    // Встроенные шаблоны (так как у нас один файл)
    this.#registerTemplate('category', this.#getCategoryTemplate());
    this.#registerTemplate('topic', this.#getTopicTemplate());
  }

  #registerTemplate(name, template) {
    try {
      this.#templates.set(name, Handlebars.compile(template));
    } catch (error) {
      throw new TemplateError(
          `Failed to compile template: ${name}`,
          'TEMPLATE_COMPILE_FAILED',
          { templateName: name, error: error.message }
      );
    }
  }

  render(templateName, data) {
    const template = this.#templates.get(templateName);
    if (!template) {
      throw new TemplateError(
          `Template not found: ${templateName}`,
          'TEMPLATE_NOT_FOUND',
          { templateName }
      );
    }

    try {
      return template(data);
    } catch (error) {
      throw new TemplateError(
          `Failed to render template: ${templateName}`,
          'TEMPLATE_RENDER_FAILED',
          { templateName, error: error.message }
      );
    }
  }

  #getCategoryTemplate() {
    return `---
title: "{{title}}"
description: "{{description}}"
category: "{{category.slug}}"
difficulty: "{{category.difficulty}}"
estimatedHours: {{category.estimatedHours}}
modules: "{{category.modules}}"
language: "{{language}}"
authorId: "{{authorId}}"
lastUpdated: "{{lastUpdated}}"
gitPath: "content/{{category.slug}}/index.md"
---

# {{title}}

## Обзор

{{description}}

Эта категория охватывает модули {{category.modules}} уровня {{toLowerCase category.difficulty}}.

## Цели обучения

По завершении этой категории вы сможете:

- Понимать основные концепции {{toLowerCase title}}
- Применять лучшие практики в реальных сценариях
- Создавать готовые для production приложения на Go
- Эффективно отлаживать и оптимизировать код на Go

## Структура категории

Категория организована в темы, которые постепенно развивают ваши знания:

1. **Основы**: Ключевые концепции и синтаксис
2. **Практическое применение**: Примеры из реального мира
3. **Лучшие практики**: Отраслевые стандарты и паттерны
4. **Продвинутые темы**: Техники экспертного уровня

## Предварительные требования

- Базовое понимание синтаксиса Go
- Знакомство с инструментами командной строки
- Настроенный текстовый редактор или IDE

## Примерное время изучения

**Всего**: {{category.estimatedHours}} часов
**На модуль**: 2-3 часа
**Сложность**: {{category.difficulty}}

## Начало работы

Начните с первой темы и систематически проходите каждую. Каждая тема включает:

- Подробные объяснения
- Примеры кода, которые можно запустить
- Практические упражнения
- Применение в реальном мире

Готовы начать? Давайте погрузимся в изучение {{toLowerCase title}}!`;
  }

  #getTopicTemplate() {
    return `---
title: "{{title}}"
description: "{{description}}"
module: {{moduleNumber}}
category: "{{category.slug}}"
slug: "{{slug}}"
language: "{{language}}"
difficulty: "{{category.difficulty}}"
estimatedMinutes: {{estimatedMinutes}}
tags: ["golang", "{{category.slug}}", "tutorial"]
objectives:
  - "Изучить основные концепции темы"
  - "Понять практическое применение"
  - "Освоить лучшие практики"
prerequisites:
  - "Базовые знания Go"
  - "Понимание предыдущих тем"
authorId: "{{authorId}}"
lastUpdated: "{{lastUpdated}}"
gitPath: "content/{{category.slug}}/{{slug}}/topic.md"
---

# {{title}}

## 🎯 Что вы изучите

В этой теме вы:
- Поймете ключевые концепции {{toLowerCase title}}
- Изучите практические примеры применения
- Освоите лучшие практики разработки
- Выполните упражнения для закрепления знаний

**Время изучения:** {{estimatedMinutes}} минут  
**Уровень сложности:** {{category.difficulty}}  
**Модуль:** {{moduleNumber}}

## 📚 Теоретическая часть

### Основные концепции

{{#if description}}{{description}}{{else}}Подробное объяснение концепций будет добавлено здесь.{{/if}}

### Ключевые принципы

1. **Принцип 1** - Объяснение первого принципа
2. **Принцип 2** - Объяснение второго принципа
3. **Принцип 3** - Объяснение третьего принципа

### Когда и зачем использовать

Практические сценарии применения:
- Сценарий 1: Описание
- Сценарий 2: Описание
- Сценарий 3: Описание

## 💻 Практические примеры

### Пример 1: Базовое использование

\`\`\`go
package main

import "fmt"

func main() {
    // TODO: Добавьте базовый пример
    fmt.Println("Пример для темы: {{title}}")
    
    // Демонстрация основной концепции
    result := basicExample()
    fmt.Printf("Результат: %v\\n", result)
}

func basicExample() string {
    // TODO: Реализуйте базовый пример
    return "Базовый результат"
}
\`\`\`

**Объяснение:**
- \`package main\` - объявляет исполняемый пакет
- \`import "fmt"\` - импортирует пакет для форматированного вывода
- \`func main()\` - точка входа в программу

**Результат выполнения:**
\`\`\`
Пример для темы: {{title}}
Результат: Базовый результат
\`\`\`

### Пример 2: Практическое применение

\`\`\`go
package main

import (
    "fmt"
    "log"
)

func main() {
    // TODO: Добавьте практический пример
    fmt.Println("Практический пример:")
    
    if err := practicalExample(); err != nil {
        log.Printf("Ошибка: %v", err)
        return
    }
    
    fmt.Println("Пример выполнен успешно")
}

func practicalExample() error {
    // TODO: Реализуйте практический пример с обработкой ошибок
    return nil
}
\`\`\`

### Пример 3: Продвинутое использование

\`\`\`go
package main

import (
    "fmt"
    "sync"
)

func main() {
    // TODO: Добавьте продвинутый пример
    fmt.Println("Продвинутый пример:")
    
    result := advancedExample()
    fmt.Printf("Продвинутый результат: %v\\n", result)
}

func advancedExample() interface{} {
    // TODO: Реализуйте продвинутый пример
    // Может включать горутины, каналы, интерфейсы и т.д.
    
    var wg sync.WaitGroup
    results := make(chan string, 1)
    
    wg.Add(1)
    go func() {
        defer wg.Done()
        results <- "Продвинутый результат"
    }()
    
    wg.Wait()
    close(results)
    
    return <-results
}
\`\`\`

## 🔧 Лучшие практики

1. **Практика 1** - Описание и обоснование
   - Как реализовать
   - Почему это важно
   - Пример использования

2. **Практика 2** - Описание и обоснование
   - Как реализовать
   - Почему это важно
   - Пример использования

3. **Практика 3** - Описание и обоснование
   - Как реализовать
   - Почему это важно
   - Пример использования

## ⚠️ Частые ошибки

1. **Ошибка 1** - Описание и способы избежать
   \`\`\`go
   // ❌ Неправильно
   // Код с ошибкой
   
   // ✅ Правильно  
   // Исправленный код
   \`\`\`

2. **Ошибка 2** - Описание и способы избежать

3. **Ошибка 3** - Описание и способы избежать

## 🌍 Применение в реальном мире

Примеры использования в production:

### Docker
Как Docker использует эту концепцию в своей кодовой базе...

### Kubernetes  
Применение в Kubernetes для...

### Prometheus
Использование в системе мониторинга...

## 📝 Резюме

Ключевые моменты этой темы:
- **Пункт 1**: Краткое описание
- **Пункт 2**: Краткое описание  
- **Пункт 3**: Краткое описание

## 🔗 Дополнительные ресурсы

- [Официальная документация](https://golang.org/doc/)
- [Go by Example](https://gobyexample.com/)
- [Effective Go](https://golang.org/doc/effective_go.html)
- [Go Blog](https://blog.golang.org/)

## ➡️ Что дальше?

В следующей теме мы изучим: **[название следующей темы]**

Убедитесь, что вы:
- ✅ Понимаете основные концепции
- ✅ Запустили все примеры кода
- ✅ Выполнили упражнения
- ✅ Готовы к следующей теме

---

## 🎯 Практические упражнения

### Упражнение 1: Базовая реализация

**Задача:** Реализуйте базовый функционал, изученный в теме.

**Требования:**
- Создайте новый файл \`exercise1.go\`
- Реализуйте основные функции
- Добавьте обработку ошибок
- Протестируйте код

**Код для начала:**

\`\`\`go
package main

import "fmt"

// TODO: Реализуйте базовый функционал
func main() {
    fmt.Println("Упражнение 1: Базовая реализация")
    
    // Ваш код здесь
    result := solveBasic()
    fmt.Printf("Результат: %v\\n", result)
}

func solveBasic() interface{} {
    // TODO: Реализуйте решение
    return "Базовое решение"
}
\`\`\`

**Ожидаемый результат:**
\`\`\`
Упражнение 1: Базовая реализация
Результат: [Ваш результат]
\`\`\`

**Подсказки:**
- Используйте концепции из основной темы
- Не забывайте про обработку ошибок
- Тестируйте код на разных входных данных

### Упражнение 2: Практическое применение

**Задача:** Создайте практическое приложение, используя изученные концепции.

**Требования:**
- Структурированный код с несколькими функциями
- Работа с пользовательским вводом
- Обработка edge cases
- Документирование кода

**Код для начала:**

\`\`\`go
package main

import (
    "bufio"
    "fmt"
    "os"
    "strings"
    "log"
)

func main() {
    fmt.Println("Упражнение 2: Практическое применение")
    
    reader := bufio.NewReader(os.Stdin)
    fmt.Print("Введите данные: ")
    
    input, err := reader.ReadString('\\n')
    if err != nil {
        log.Printf("Ошибка чтения: %v", err)
        return
    }
    
    input = strings.TrimSpace(input)
    
    // TODO: Обработайте ввод согласно заданию
    result := processInput(input)
    fmt.Printf("Результат: %s\\n", result)
}

func processInput(input string) string {
    // TODO: Реализуйте обработку
    if input == "" {
        return "Ошибка: пустой ввод"
    }
    
    return fmt.Sprintf("Обработанный результат: %s", input)
}

// TODO: Добавьте дополнительные функции по необходимости
\`\`\`

### Упражнение 3: Продвинутая задача

**Задача:** Создайте комплексное решение, демонстрирующее глубокое понимание темы.

**Требования:**
- Модульная архитектура
- Использование горутин (если применимо)
- Обработка ошибок на всех уровнях
- Оптимизация производительности

**Код для начала:**

\`\`\`go
package main

import (
    "context"
    "fmt"
    "log"
    "os"
    "os/signal"
    "sync"
    "syscall"
    "time"
)

func main() {
    fmt.Println("Упражнение 3: Продвинутая задача")
    
    // Настройка graceful shutdown
    ctx, cancel := context.WithCancel(context.Background())
    defer cancel()
    
    // Обработка сигналов
    sigChan := make(chan os.Signal, 1)
    signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
    
    // TODO: Запустите вашу основную логику
    var wg sync.WaitGroup
    
    wg.Add(1)
    go func() {
        defer wg.Done()
        runAdvancedLogic(ctx)
    }()
    
    // Ожидание сигнала завершения
    <-sigChan
    log.Println("Получен сигнал завершения...")
    cancel()
    
    // Ожидание завершения всех горутин
    wg.Wait()
    log.Println("Приложение завершено")
}

func runAdvancedLogic(ctx context.Context) {
    // TODO: Реализуйте продвинутую логику
    ticker := time.NewTicker(time.Second)
    defer ticker.Stop()
    
    for {
        select {
        case <-ctx.Done():
            log.Println("Завершение продвинутой логики...")
            return
        case <-ticker.C:
            // TODO: Ваша периодическая логика
            processAdvanced()
        }
    }
}

func processAdvanced() {
    // TODO: Реализуйте продвинутую обработку
    log.Println("Выполнение продвинутой обработки...")
}
\`\`\`

## 🔍 Критерии оценки упражнений

**Упражнение 1 (Базовое):**
- ✅ Код компилируется без ошибок
- ✅ Реализован требуемый функционал
- ✅ Есть базовая обработка ошибок
- ✅ Код читаемый и структурированный

**Упражнение 2 (Практическое):**
- ✅ Все требования упражнения 1
- ✅ Правильная обработка пользовательского ввода
- ✅ Валидация входных данных
- ✅ Документирование функций
- ✅ Обработка edge cases

**Упражнение 3 (Продвинутое):**
- ✅ Все требования предыдущих упражнений
- ✅ Модульная архитектура
- ✅ Использование контекста и горутин
- ✅ Graceful shutdown
- ✅ Логирование и метрики

## 💡 Советы по выполнению

- **Читайте ошибки:** Go компилятор дает очень информативные сообщения
- **Используйте go fmt:** Автоматически форматируйте код
- **Тестируйте постепенно:** Не пишите весь код сразу, тестируйте по частям
- **Изучайте стандартную библиотеку:** Многое уже реализовано
- **Используйте go vet:** Проверяйте код на потенциальные проблемы

---

*💡 Совет: Практикуйтесь с примерами кода и экспериментируйте с различными подходами для лучшего понимания материала.*

*🎓 Удачи в выполнении упражнений! Помните: практика - лучший способ изучения программирования.*`;
  }
}

// Регистрация хелперов Handlebars
Handlebars.registerHelper('toLowerCase', function(str) {
  return str ? str.toLowerCase() : '';
});

// === CONTENT GENERATOR ===
class ContentGenerator {
  #templateManager;
  #fileSystem;
  #logger;

  constructor(templateManager, fileSystem = null, logger = console) {
    this.#templateManager = templateManager;
    this.#fileSystem = fileSystem || {
      writeFile: async (path, content, encoding) => await writeFile(path, content, encoding),
      mkdirSync: (path, options) => mkdirSync(path, options)
    };
    this.#logger = logger;
  }

  async generateContent(contentType, data) {
    try {
      const content = this.#templateManager.render(contentType, {
        ...data,
        lastUpdated: new Date().toISOString()
      });

      const filePath = this.#getFilePath(contentType, data);
      await this.#ensureDirectory(filePath);
      await this.#writeFile(filePath, content);

      return filePath;
    } catch (error) {
      throw new ContentAuthorError(
          `Failed to generate ${contentType} content`,
          'CONTENT_GENERATION_FAILED',
          { contentType, error: error.message }
      );
    }
  }

  #getFilePath(contentType, data) {
    const contentStructure = {
      category: `content/${data.category.slug}/index.md`,
      topic: `content/${data.category.slug}/${data.slug}/topic.md`
    };

    return contentStructure[contentType];
  }

  async #ensureDirectory(filePath) {
    const dir = dirname(filePath);
    this.#fileSystem.mkdirSync(dir, { recursive: true });
  }

  async #writeFile(filePath, content) {
    await this.#fileSystem.writeFile(filePath, content, 'utf8');
  }

  generateSlug(title, moduleNumber = null) {
    const titleSlug = slugify(title, { lower: true, strict: true });

    if (moduleNumber !== null) {
      const paddedNumber = String(moduleNumber).padStart(2, '0');
      return `${paddedNumber}-${titleSlug}`;
    }

    return titleSlug;
  }
}

// === CONTENT VALIDATOR ===
class ContentValidator {
  #configManager;
  #logger;

  constructor(configManager, logger = console) {
    this.#configManager = configManager;
    this.#logger = logger;
  }

  async validateStructure() {
    const requiredDirs = ['content'];
    const errors = [];

    for (const dir of requiredDirs) {
      if (!existsSync(dir)) {
        errors.push(`Missing required directory: ${dir}`);
      }
    }

    if (errors.length > 0) {
      throw new ValidationError(
          'Directory structure validation failed',
          'VALIDATION_STRUCTURE_FAILED',
          { errors }
      );
    }
  }

  async validateContent(filePath) {
    if (!existsSync(filePath)) {
      throw new ValidationError(
          'Content file not found',
          'VALIDATION_FILE_NOT_FOUND',
          { filePath }
      );
    }

    const content = await readFile(filePath, 'utf8');
    const standards = this.#configManager.getQualityStandards();
    const errors = [];

    // Validate word count
    const wordCount = this.#countWords(content);
    if (wordCount < standards.minWords) {
      errors.push(`Word count (${wordCount}) is below minimum (${standards.minWords})`);
    }

    // Validate code examples
    const codeExamples = this.#countCodeExamples(content);
    if (codeExamples < standards.minCodeExamples) {
      errors.push(`Code examples (${codeExamples}) below minimum (${standards.minCodeExamples})`);
    }

    // Validate exercises
    const exercises = this.#countExercises(content);
    if (exercises < standards.minExercises) {
      errors.push(`Exercises (${exercises}) below minimum (${standards.minExercises})`);
    }

    if (errors.length > 0) {
      throw new ValidationError(
          'Content quality validation failed',
          'VALIDATION_QUALITY_FAILED',
          { filePath, errors }
      );
    }
  }

  #countWords(content) {
    // Remove frontmatter
    const contentWithoutFrontmatter = content.replace(/^---[\s\S]*?---\n/, '');
    // Remove code blocks
    const contentWithoutCode = contentWithoutFrontmatter.replace(/```[\s\S]*?```/g, '');
    // Count words
    return contentWithoutCode.split(/\s+/).filter(word => word.length > 0).length;
  }

  #countCodeExamples(content) {
    const codeBlocks = content.match(/```go[\s\S]*?```/g) || [];
    return codeBlocks.length;
  }

  #countExercises(content) {
    const exercises = content.match(/### Упражнение \d+:/g) || [];
    return exercises.length;
  }

  async validateAll() {
    await this.validateStructure();

    const categories = this.#configManager.getCategories();
    const validationResults = [];

    for (const category of categories) {
      const categoryPath = `content/${category.slug}`;
      if (existsSync(categoryPath)) {
        // Validate category index
        try {
          await this.validateContent(`${categoryPath}/index.md`);
          validationResults.push({
            path: `${categoryPath}/index.md`,
            status: 'passed'
          });
        } catch (error) {
          validationResults.push({
            path: `${categoryPath}/index.md`,
            status: 'failed',
            errors: error.details.errors
          });
        }
      }
    }

    return validationResults;
  }
}

// === USER INTERFACE ===
class UserInterface {
  #prompter;
  #logger;

  constructor(prompter = inquirer, logger = console) {
    this.#prompter = prompter;
    this.#logger = logger;
  }

  showWelcome(config) {
    const languageNames = {
      'en': 'English',
      'ru': 'Русский'
    };

    const language = config.structure.defaultLanguage;

    this.#logger.log(boxen(
        chalk.blue.bold('🚀 Go Tutorial Content Author\n\n') +
        chalk.white(`Target Language: ${languageNames[language] || language}\n`) +
        chalk.white('Repository: ') + chalk.yellow.bold('golang-book-ru\n') +
        chalk.white('Platform: ') + chalk.yellow.bold('godojo.dev'),
        { padding: 1, borderColor: 'blue', borderStyle: 'round' }
    ));
  }

  showAuthorProfile(profile) {
    this.#logger.log(chalk.green(`✅ Добро пожаловать, ${profile.displayName}!`));
    this.#logger.log(chalk.gray(`👤 ID: ${profile.authorId}`));
    this.#logger.log(chalk.gray(`📝 Язык контента: ${this.#getLanguageName(profile.language)}`));
    this.#logger.log(chalk.gray(`📊 Создано контента: ${profile.contentCreated}`));
    this.#logger.log(chalk.gray(`🏷️  Специализация: ${profile.expertise.join(', ')}`));
  }

  async promptAuthorDetails() {
    this.#logger.log(chalk.yellow('\n📝 Настройка профиля автора для godojo.dev\n'));

    return await this.#prompter.prompt([
      {
        type: 'input',
        name: 'displayName',
        message: 'Ваше полное имя (будет показано на сайте):',
        validate: input => input.trim().length >= 2 || 'Имя должно содержать минимум 2 символа'
      },
      {
        type: 'input',
        name: 'username',
        message: 'Уникальный username (английские буквы, цифры, дефис):',
        validate: input => {
          const valid = /^[a-zA-Z0-9-]+$/.test(input) && input.length >= 3;
          return valid || 'Username должен содержать только английские буквы, цифры и дефис (минимум 3 символа)';
        },
        filter: input => input.toLowerCase()
      },
      {
        type: 'input',
        name: 'email',
        message: 'Email (для связи и уведомлений):',
        validate: input => {
          const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input);
          return valid || 'Введите корректный email адрес';
        }
      },
      {
        type: 'input',
        name: 'bio',
        message: 'Краткое описание (появится в профиле):',
        validate: input => input.trim().length >= 10 || 'Описание должно содержать минимум 10 символов'
      },
      {
        type: 'checkbox',
        name: 'expertise',
        message: 'Ваши области экспертизы (выберите несколько):',
        choices: [
          { name: 'Основы Go', value: 'go-basics' },
          { name: 'Конкурентность', value: 'concurrency' },
          { name: 'Веб-разработка', value: 'web-development' },
          { name: 'Базы данных', value: 'databases' },
          { name: 'Тестирование', value: 'testing' },
          { name: 'Production/DevOps', value: 'production' },
          { name: 'Производительность', value: 'performance' },
          { name: 'Архитектура систем', value: 'architecture' },
          { name: 'Безопасность', value: 'security' },
          { name: 'Kubernetes', value: 'kubernetes' }
        ],
        validate: input => input.length > 0 || 'Выберите хотя бы одну область экспертизы'
      },
      {
        type: 'input',
        name: 'githubUsername',
        message: 'GitHub username (опционально):',
        filter: input => input.trim() || null
      },
      {
        type: 'input',
        name: 'twitterUsername',
        message: 'Twitter username (опционально, без @):',
        filter: input => input.trim() || null
      },
      {
        type: 'input',
        name: 'website',
        message: 'Личный сайт (опционально):',
        filter: input => input.trim() || null
      }
    ]);
  }

  async promptContentType(categories) {
    this.#logger.log(chalk.blue.bold('\n📝 Создание нового контента\n'));

    const categoryChoices = categories.map(cat => ({
      name: `${cat.titleRu} - Модули ${cat.modules} (${cat.difficulty})`,
      value: cat.slug,
      short: cat.titleRu
    }));

    const { category } = await this.#prompter.prompt([{
      type: 'list',
      name: 'category',
      message: 'Выберите категорию:',
      choices: categoryChoices
    }]);

    const { contentType } = await this.#prompter.prompt([{
      type: 'list',
      name: 'contentType',
      message: 'Тип контента:',
      choices: [
        { name: 'Обзор категории (Category Overview)', value: 'category' },
        { name: 'Тема урока (Topic)', value: 'topic' }
      ]
    }]);

    return { category, contentType };
  }

  async promptTopicDetails() {
    return await this.#prompter.prompt([
      {
        type: 'input',
        name: 'title',
        message: 'Название темы:',
        validate: input => input.trim().length > 0 || 'Название темы обязательно',
        filter: input => input.trim()
      },
      {
        type: 'input',
        name: 'description',
        message: 'Краткое описание:',
        filter: input => input.trim()
      },
      {
        type: 'number',
        name: 'moduleNumber',
        message: 'Номер модуля:',
        validate: input => (input > 0 && input <= 79) || 'Номер модуля должен быть от 1 до 79'
      },
      {
        type: 'number',
        name: 'estimatedMinutes',
        message: 'Примерное время изучения (минут):',
        default: 45,
        validate: input => input > 0 || 'Время должно быть больше 0'
      }
    ]);
  }

  showContentCreated(details) {
    this.#logger.log(chalk.green('\n✅ Контент успешно создан!'));
    this.#logger.log(chalk.gray('📁 Категория:'), chalk.white(details.category.titleRu));
    this.#logger.log(chalk.gray('📝 Тип:'), chalk.white(details.contentType));
    this.#logger.log(chalk.gray('🏷️  Slug:'), chalk.white(details.slug));

    this.#logger.log(chalk.blue('\n📂 Созданные файлы:'));
    for (const filePath of details.files) {
      const fullPath = join(cwd(), filePath);
      this.#logger.log(chalk.gray('  📄'), chalk.cyan(`file://${fullPath}`));
    }
  }

  showNextSteps(contentType) {
    this.#logger.log(chalk.blue('\n📝 Следующие шаги:'));

    switch (contentType) {
      case 'topic':
        this.#logger.log(chalk.gray('1. Откройте topic.md и заполните содержимое'));
        this.#logger.log(chalk.gray('2. Добавьте реальные примеры кода в разделы'));
        this.#logger.log(chalk.gray('3. Дополните упражнения в конце файла'));
        this.#logger.log(chalk.gray('4. Протестируйте все примеры кода'));
        break;

      case 'category':
        this.#logger.log(chalk.gray('1. Откройте index.md и дополните описание категории'));
        this.#logger.log(chalk.gray('2. Создайте первые темы в этой категории'));
        this.#logger.log(chalk.gray('3. Упорядочите темы по сложности'));
        break;
    }

    this.#logger.log(chalk.blue('\n🛠️  Полезные команды:'));
    this.#logger.log(chalk.gray('• Валидация:'), chalk.yellow('npm run author:validate'));
    this.#logger.log(chalk.gray('• Создание еще контента:'), chalk.yellow('npm run author:new'));

    this.#logger.log(chalk.blue('\n💡 Советы:'));
    this.#logger.log(chalk.gray('• Используйте go run для проверки примеров кода'));
    this.#logger.log(chalk.gray('• Соблюдайте минимум 800 слов на тему'));
    this.#logger.log(chalk.gray('• Добавляйте минимум 3 примера кода'));
    this.#logger.log(chalk.gray('• Создавайте минимум 2 упражнения'));
  }

  showHelp(config) {
    const language = config.structure.defaultLanguage;

    this.#logger.log(boxen(
        chalk.blue.bold('🚀 Go Tutorial Content Author\n\n') +
        chalk.white('Инструмент для создания контента golang-book-ru\n') +
        chalk.gray(`Язык контента: ${this.#getLanguageName(language)}\n\n`) +
        chalk.white('Доступные команды:\n\n') +
        chalk.yellow('npm run author:init') + chalk.gray('     - Настройка окружения автора\n') +
        chalk.yellow('npm run author:new') + chalk.gray('      - Создание нового контента\n') +
        chalk.yellow('npm run author:validate') + chalk.gray(' - Валидация качества контента\n') +
        chalk.yellow('npm run author:stats') + chalk.gray('    - Статистика автора\n') +
        chalk.yellow('npm run author:help') + chalk.gray('     - Показать эту справку'),
        { padding: 1, borderColor: 'blue', borderStyle: 'round' }
    ));

    this.#logger.log(chalk.blue('\n📚 Новая структура контента:'));
    this.#logger.log(chalk.gray('content/'));
    this.#logger.log(chalk.gray('├── basics/'));
    this.#logger.log(chalk.gray('│   ├── index.md              # Обзор категории'));
    this.#logger.log(chalk.gray('│   ├── 01-introduction/'));
    this.#logger.log(chalk.gray('│   │   └── topic.md          # Контент + код + упражнения'));
    this.#logger.log(chalk.gray('│   └── 02-variables/'));
    this.#logger.log(chalk.gray('│       └── topic.md          # Все в одном файле'));
    this.#logger.log(chalk.gray('└── concurrency/'));
    this.#logger.log(chalk.gray('    ├── index.md'));
    this.#logger.log(chalk.gray('    └── [темы...]'));

    this.#logger.log(chalk.blue('\n🎯 Стандарты качества:'));
    this.#logger.log(chalk.gray(`• Минимум ${config.quality.minWords} слов на тему`));
    this.#logger.log(chalk.gray(`• Минимум ${config.quality.minCodeExamples} примеров кода`));
    this.#logger.log(chalk.gray(`• Минимум ${config.quality.minExercises} упражнений`));
  }

  showValidationResults(results) {
    this.#logger.log(chalk.blue('\n📊 Результаты валидации:\n'));

    let passed = 0;
    let failed = 0;

    for (const result of results) {
      if (result.status === 'passed') {
        this.#logger.log(chalk.green('✅'), chalk.gray(result.path));
        passed++;
      } else {
        this.#logger.log(chalk.red('❌'), chalk.gray(result.path));
        if (result.errors) {
          result.errors.forEach(error => {
            this.#logger.log(chalk.red(`   - ${error}`));
          });
        }
        failed++;
      }
    }

    this.#logger.log(chalk.blue(`\n📈 Итого: ${passed} прошло, ${failed} не прошло`));

    if (failed === 0) {
      this.#logger.log(chalk.green('\n✅ Весь контент соответствует стандартам качества!'));
    } else {
      this.#logger.log(chalk.yellow('\n⚠️  Некоторый контент требует доработки'));
    }
  }

  showError(error) {
    this.#logger.error(chalk.red(`\n❌ ${error.message}`));

    if (error.details) {
      if (error.details.errors) {
        this.#logger.error(chalk.red('\nОшибки:'));
        error.details.errors.forEach(err => {
          if (typeof err === 'string') {
            this.#logger.error(chalk.red(`  - ${err}`));
          } else {
            this.#logger.error(chalk.red(`  - ${err.message || JSON.stringify(err)}`));
          }
        });
      }

      if (error.details.configPath) {
        this.#logger.error(chalk.gray(`\nФайл: ${error.details.configPath}`));
      }
    }

    if (process.env.NODE_ENV === 'development' && error.stack) {
      this.#logger.error(chalk.gray('\nСтек вызовов:'));
      this.#logger.error(chalk.gray(error.stack));
    }
  }

  #getLanguageName(langCode) {
    const names = {
      'en': 'English',
      'ru': 'Русский'
    };
    return names[langCode] || langCode;
  }
}

// === MAIN APPLICATION ===
class ContentAuthor {
  #configManager;
  #authorManager;
  #contentGenerator;
  #contentValidator;
  #ui;
  #logger;

  constructor({
                configManager = new ConfigManager(),
                authorManager = new AuthorManager(),
                templateManager = new TemplateManager(),
                ui = new UserInterface(),
                logger = console
              } = {}) {
    this.#configManager = configManager;
    this.#authorManager = authorManager;
    this.#contentGenerator = new ContentGenerator(templateManager);
    this.#contentValidator = new ContentValidator(configManager);
    this.#ui = ui;
    this.#logger = logger;
  }

  async init() {
    try {
      const config = await this.#configManager.loadConfig();
      this.#ui.showWelcome(config);

      await this.#authorManager.loadProfile();
      const authorProfile = this.#authorManager.getProfile();

      if (authorProfile) {
        this.#ui.showAuthorProfile(authorProfile);
        return;
      }

      // Create new profile
      const answers = await this.#ui.promptAuthorDetails();
      const languageConfig = this.#configManager.getLanguageConfig();

      const newProfile = {
        authorId: this.#authorManager.generateAuthorId(answers.username),
        username: answers.username,
        displayName: answers.displayName,
        email: answers.email,
        bio: answers.bio,
        expertise: answers.expertise,
        socialLinks: {
          github: answers.githubUsername,
          twitter: answers.twitterUsername,
          website: answers.website
        },
        language: languageConfig.default,
        joinDate: new Date().toISOString(),
        contentCreated: 0,
        contentHistory: [],
        platform: 'godojo.dev',
        repository: 'golang-book-ru',
        toolVersion: '2.0.0'
      };

      await this.#authorManager.saveProfile(newProfile);

      this.#logger.log(chalk.green('\n✅ Профиль автора создан!'));
      this.#logger.log(chalk.blue('\n📋 Информация профиля:'));
      this.#logger.log(chalk.gray(`👤 Имя: ${newProfile.displayName}`));
      this.#logger.log(chalk.gray(`🆔 ID: ${newProfile.authorId}`));
      this.#logger.log(chalk.gray(`📧 Email: ${newProfile.email}`));
      this.#logger.log(chalk.gray(`🏷️  Экспертиза: ${newProfile.expertise.join(', ')}`));

    } catch (error) {
      this.#ui.showError(error);
      process.exit(1);
    }
  }

  async createContent() {
    try {
      const config = await this.#configManager.loadConfig();
      const authorProfile = this.#authorManager.getProfile();

      if (!authorProfile) {
        await this.#authorManager.loadProfile();
        const loadedProfile = this.#authorManager.getProfile();

        if (!loadedProfile) {
          this.#logger.log(chalk.red('❌ Сначала запустите'), chalk.yellow('npm run author:init'));
          return;
        }
      }

      const categories = this.#configManager.getCategories();
      const { category: categorySlug, contentType } = await this.#ui.promptContentType(categories);

      const selectedCategory = categories.find(c => c.slug === categorySlug);

      let contentDetails;
      if (contentType === 'topic') {
        const topicData = await this.#ui.promptTopicDetails();
        const slug = this.#contentGenerator.generateSlug(topicData.title, topicData.moduleNumber);
        contentDetails = { ...topicData, slug };
      } else {
        contentDetails = {
          title: selectedCategory.titleRu,
          description: selectedCategory.descriptionRu,
          slug: selectedCategory.slug
        };
      }

      const spinner = ora('Создание структуры контента...').start();

      try {
        const filePath = await this.#contentGenerator.generateContent(contentType, {
          ...contentDetails,
          category: selectedCategory,
          language: config.structure.defaultLanguage,
          authorId: this.#authorManager.getProfile().authorId
        });

        spinner.succeed('Структура контента создана!');

        await this.#authorManager.updateStats(contentType, {
          ...contentDetails,
          category: selectedCategory.slug,
          files: [filePath]
        });

        this.#ui.showContentCreated({
          category: selectedCategory,
          contentType,
          slug: contentDetails.slug,
          files: [filePath]
        });

        this.#ui.showNextSteps(contentType);

      } catch (error) {
        spinner.fail('Не удалось создать контент');
        throw error;
      }

    } catch (error) {
      this.#ui.showError(error);
      process.exit(1);
    }
  }

  async validate() {
    try {
      await this.#configManager.loadConfig();

      const spinner = ora('Валидация структуры контента...').start();

      try {
        const results = await this.#contentValidator.validateAll();
        spinner.succeed('Валидация завершена!');

        this.#ui.showValidationResults(results);

      } catch (error) {
        spinner.fail('Валидация не пройдена');
        throw error;
      }

    } catch (error) {
      this.#ui.showError(error);
      process.exit(1);
    }
  }

  async showHelp() {
    try {
      const config = await this.#configManager.loadConfig();
      this.#ui.showHelp(config);
    } catch (error) {
      this.#ui.showError(error);
      process.exit(1);
    }
  }

  async showStats() {
    try {
      await this.#authorManager.loadProfile();
      const profile = this.#authorManager.getProfile();

      if (!profile) {
        this.#logger.log(chalk.red('❌ Профиль автора не найден. Сначала запустите'), chalk.yellow('npm run author:init'));
        return;
      }

      this.#logger.log(chalk.blue.bold('\n📊 Статистика автора\n'));
      this.#logger.log(chalk.gray('👤 Автор:'), chalk.white(profile.displayName));
      this.#logger.log(chalk.gray('📝 Создано контента:'), chalk.white(profile.contentCreated));
      this.#logger.log(chalk.gray('📅 Дата регистрации:'), chalk.white(new Date(profile.joinDate).toLocaleDateString('ru-RU')));

      if (profile.contentHistory.length > 0) {
        this.#logger.log(chalk.blue('\n📚 Последние 5 созданных материалов:'));
        const recentContent = profile.contentHistory.slice(-5).reverse();

        recentContent.forEach((content, index) => {
          this.#logger.log(chalk.gray(`${index + 1}. ${content.title} (${content.type})`));
          this.#logger.log(chalk.gray(`   Категория: ${content.category}, Создано: ${new Date(content.createdAt).toLocaleDateString('ru-RU')}`));
        });
      }
    } catch (error) {
      this.#ui.showError(error);
      process.exit(1);
    }
  }
}

// === CLI ENTRY POINT ===
async function checkNodeVersion() {
  const currentVersion = process.versions.node;
  const requiredMajorVersion = 22;
  const currentMajorVersion = parseInt(currentVersion.split('.')[0]);

  if (currentMajorVersion < requiredMajorVersion) {
    console.error(chalk.red(`\n❌ Требуется Node.js версии ${requiredMajorVersion}.0.0 или выше (LTS)`));
    console.error(chalk.yellow(`📍 Текущая версия: ${currentVersion}`));
    console.error(chalk.gray(`\n💡 Установите последнюю LTS версию:`));
    console.error(chalk.cyan(`   https://nodejs.org/\n`));
    process.exit(1);
  }
}

async function main() {
  // Проверяем версию Node.js
  checkNodeVersion();

  const app = new ContentAuthor();
  const command = process.argv[2];

  try {
    switch (command) {
      case 'init':
        await app.init();
        break;
      case 'new':
        await app.createContent();
        break;
      case 'validate':
        await app.validate();
        break;
      case 'stats':
        await app.showStats();
        break;
      case 'help':
      default:
        await app.showHelp();
    }
  } catch (error) {
    console.error(chalk.red('❌ Произошла ошибка:'), error.message);
    if (process.env.NODE_ENV === 'development') {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run the application
main().catch(error => {
  console.error(chalk.red('❌ Fatal error:'), error);
  process.exit(1);
});