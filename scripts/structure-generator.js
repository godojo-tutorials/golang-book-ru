#!/usr/bin/env node

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';

/**
 * Structure Generator
 * Генерирует правильную структуру проекта
 */
class StructureGenerator {
    constructor() {
        this.createdItems = [];
        this.skippedItems = [];
    }

    /**
     * Запуск генератора
     */
    async run() {
        console.log(chalk.blue.bold('\n🏗️  Генератор структуры проекта\n'));

        // Проверяем, нужна ли полная генерация
        const needsFullSetup = !existsSync('content.config.json');

        if (needsFullSetup) {
            console.log(chalk.yellow('⚠️  Обнаружен новый проект. Требуется полная настройка.\n'));
            await this.fullSetup();
        } else {
            await this.selectiveGeneration();
        }
    }

    /**
     * Полная настройка нового проекта
     */
    async fullSetup() {
        const { confirmSetup } = await inquirer.prompt([{
            type: 'confirm',
            name: 'confirmSetup',
            message: 'Создать полную структуру проекта Go Tutorial?',
            default: true
        }]);

        if (!confirmSetup) {
            console.log(chalk.gray('\n❌ Настройка отменена\n'));
            return;
        }

        const spinner = ora('Создание структуры проекта...').start();

        try {
            // Создаем базовые директории
            spinner.text = 'Создание директорий...';
            await this.createDirectories();

            // Создаем конфигурационные файлы
            spinner.text = 'Создание конфигурации...';
            await this.createConfigFiles();

            // Создаем документацию
            spinner.text = 'Создание документации...';
            await this.createDocumentation();

            // Создаем примеры контента
            spinner.text = 'Создание примеров контента...';
            await this.createSampleContent();

            spinner.succeed('Структура проекта создана!');

            // Выводим результаты
            this.printResults();

            // Показываем следующие шаги
            this.showNextSteps();

        } catch (error) {
            spinner.fail(`Ошибка: ${error.message}`);
            process.exit(1);
        }
    }

    /**
     * Выборочная генерация
     */
    async selectiveGeneration() {
        const { action } = await inquirer.prompt([{
            type: 'list',
            name: 'action',
            message: 'Что вы хотите создать?',
            choices: [
                {
                    name: '📁 Недостающие директории',
                    value: 'directories'
                },
                {
                    name: '📄 Конфигурационные файлы',
                    value: 'config'
                },
                {
                    name: '📚 Документацию',
                    value: 'docs'
                },
                {
                    name: '🎯 Пример контента',
                    value: 'sample'
                },
                {
                    name: '🔧 Отсутствующие скрипты',
                    value: 'scripts'
                },
                {
                    name: '❌ Отмена',
                    value: 'cancel'
                }
            ]
        }]);

        if (action === 'cancel') {
            console.log(chalk.gray('\n❌ Операция отменена\n'));
            return;
        }

        const spinner = ora('Генерация...').start();

        try {
            switch (action) {
                case 'directories':
                    await this.createDirectories();
                    break;
                case 'config':
                    await this.createConfigFiles();
                    break;
                case 'docs':
                    await this.createDocumentation();
                    break;
                case 'sample':
                    await this.createSampleContent();
                    break;
                case 'scripts':
                    await this.createMissingScripts();
                    break;
            }

            spinner.succeed('Генерация завершена!');
            this.printResults();

        } catch (error) {
            spinner.fail(`Ошибка: ${error.message}`);
        }
    }

    /**
     * Создание директорий
     */
    async createDirectories() {
        const directories = [
            'content',
            'content/basics',
            'content/advanced',
            'content/web',
            'content/concurrency',
            'content/testing',
            'scripts',
            'build',
            '.github',
            '.github/workflows'
        ];

        for (const dir of directories) {
            await this.ensureDirectory(dir);
        }
    }

    /**
     * Создание конфигурационных файлов
     */
    async createConfigFiles() {
        // content.config.json
        const contentConfig = {
            "structure": {
                "defaultLanguage": "ru",
                "languages": ["ru"]
            },
            "godojo": {
                "platform": "godojo.dev",
                "apiEndpoint": "https://api.godojo.dev/v1"
            },
            "categories": [
                {
                    "slug": "basics",
                    "titleRu": "Основы Go",
                    "titleEn": "Go Basics",
                    "descriptionRu": "Изучите фундаментальные концепции языка Go",
                    "descriptionEn": "Learn fundamental Go language concepts",
                    "modules": "1-15",
                    "difficulty": "Beginner",
                    "estimatedHours": 20
                },
                {
                    "slug": "advanced",
                    "titleRu": "Продвинутый Go",
                    "titleEn": "Advanced Go",
                    "descriptionRu": "Глубокое погружение в продвинутые возможности Go",
                    "descriptionEn": "Deep dive into advanced Go features",
                    "modules": "16-30",
                    "difficulty": "Intermediate",
                    "estimatedHours": 30
                },
                {
                    "slug": "web",
                    "titleRu": "Web-разработка",
                    "titleEn": "Web Development",
                    "descriptionRu": "Создание web-приложений на Go",
                    "descriptionEn": "Building web applications with Go",
                    "modules": "31-45",
                    "difficulty": "Intermediate",
                    "estimatedHours": 25
                },
                {
                    "slug": "concurrency",
                    "titleRu": "Конкурентность",
                    "titleEn": "Concurrency",
                    "descriptionRu": "Мастерство конкурентного программирования в Go",
                    "descriptionEn": "Mastering concurrent programming in Go",
                    "modules": "46-60",
                    "difficulty": "Advanced",
                    "estimatedHours": 35
                },
                {
                    "slug": "testing",
                    "titleRu": "Тестирование",
                    "titleEn": "Testing",
                    "descriptionRu": "Профессиональное тестирование Go приложений",
                    "descriptionEn": "Professional testing of Go applications",
                    "modules": "61-79",
                    "difficulty": "Advanced",
                    "estimatedHours": 30
                }
            ],
            "quality": {
                "minWords": 800,
                "minCodeExamples": 3,
                "minExercises": 2
            }
        };

        await this.createFile('content.config.json', JSON.stringify(contentConfig, null, 2));

        // .gitignore
        const gitignore = `# Dependencies
node_modules/

# Build output
build/
dist/
*.log

# OS files
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/
*.swp
*.swo

# Local configs
.env
.env.local
.content-author-config.json

# Temporary files
*.tmp
*.temp
`;

        await this.createFile('.gitignore', gitignore);

        // .prettierrc
        const prettierConfig = {
            "semi": true,
            "trailingComma": "es5",
            "singleQuote": true,
            "printWidth": 100,
            "tabWidth": 2,
            "useTabs": false,
            "arrowParens": "avoid",
            "endOfLine": "lf",
            "overrides": [
                {
                    "files": "*.md",
                    "options": {
                        "proseWrap": "preserve"
                    }
                }
            ]
        };

        await this.createFile('.prettierrc', JSON.stringify(prettierConfig, null, 2));
    }

    /**
     * Создание документации
     */
    async createDocumentation() {
        // README.md
        const readme = `# 📚 Go Tutorial Content - Русская версия

> Образовательный контент для изучения Go на платформе [godojo.dev](https://godojo.dev)

## 🎯 О проекте

Это репозиторий с русскоязычным контентом для обучения языку программирования Go. Контент структурирован в виде 79 модулей, покрывающих путь от начинающего до эксперта.

## 🚀 Быстрый старт

\`\`\`bash
# Клонирование репозитория
git clone https://github.com/YOUR_USERNAME/golang-book-ru.git
cd golang-book-ru

# Установка зависимостей
npm install

# Инициализация автора
npm run author:init

# Создание нового контента
npm run author:new
\`\`\`

## 📋 Структура проекта

\`\`\`
golang-book-ru/
├── content/              # Весь образовательный контент
│   ├── basics/          # Основы Go (модули 1-15)
│   ├── advanced/        # Продвинутые темы (модули 16-30)
│   ├── web/            # Web-разработка (модули 31-45)
│   ├── concurrency/    # Конкурентность (модули 46-60)
│   └── testing/        # Тестирование (модули 61-79)
├── scripts/            # Инструменты для работы с контентом
├── content.config.json # Конфигурация проекта
└── package.json        # Зависимости и скрипты
\`\`\`

## 🛠️ Доступные команды

### Для авторов
- \`npm run author:init\` - Инициализация профиля автора
- \`npm run author:new\` - Создание нового контента
- \`npm run author:validate\` - Проверка качества контента
- \`npm run author:stats\` - Статистика автора

### Для контента
- \`npm run content:check\` - Проверка всего контента
- \`npm run content:format\` - Форматирование markdown

### Для проекта
- \`npm run structure:validate\` - Проверка структуры
- \`npm run test\` - Запуск тестов

## 🤝 Как внести вклад

Мы приветствуем вклад в проект! См. [CONTRIBUTING.md](./CONTRIBUTING.md) для подробной информации.

## 📄 Лицензия

MIT © [godojo.dev](https://godojo.dev)
`;

        await this.createFile('README.md', readme);

        // Базовый CONTRIBUTING.md если его нет
        if (!existsSync('CONTRIBUTING.md')) {
            const contributing = `# Руководство для авторов контента

См. полное руководство в репозитории.

## Быстрый старт

1. Форкните репозиторий
2. Создайте ветку для вашего контента
3. Используйте инструменты автора для создания контента
4. Отправьте Pull Request

## Стандарты качества

- Минимум 800 слов на тему
- Минимум 3 примера кода
- Минимум 2 упражнения
- Все примеры должны компилироваться

## Помощь

Создайте issue если нужна помощь!
`;

            await this.createFile('CONTRIBUTING.md', contributing);
        }
    }

    /**
     * Создание примера контента
     */
    async createSampleContent() {
        // Пример index.md для категории
        const categoryIndex = `---
title: "Основы Go"
description: "Изучите фундаментальные концепции языка Go"
category: "basics"
difficulty: "Beginner"
estimatedHours: 20
modules: "1-15"
language: "ru"
authorId: "system"
lastUpdated: "${new Date().toISOString()}"
gitPath: "content/basics/index.md"
---

# Основы Go

## Обзор

Добро пожаловать в раздел "Основы Go"! Здесь вы изучите фундаментальные концепции языка программирования Go.

## Что вы изучите

- Синтаксис и структура Go
- Типы данных и переменные
- Функции и методы
- Структуры и интерфейсы
- Основы конкурентности

## Начните обучение

Выберите первую тему и начните ваше путешествие в мир Go!
`;

        await this.createFile('content/basics/index.md', categoryIndex);

        // Пример темы
        const topicDir = 'content/basics/01-introduction';
        await this.ensureDirectory(topicDir);

        const topicContent = `---
title: "Введение в Go"
description: "Познакомьтесь с языком Go и настройте окружение разработки"
module: 1
category: "basics"
slug: "01-introduction"
language: "ru"
difficulty: "Beginner"
estimatedMinutes: 30
tags: ["golang", "basics", "setup"]
objectives:
  - "Понять философию Go"
  - "Установить Go на вашу систему"
  - "Написать первую программу"
prerequisites:
  - "Базовые знания программирования"
authorId: "system"
lastUpdated: "${new Date().toISOString()}"
gitPath: "content/basics/01-introduction/topic.md"
---

# Введение в Go

## 🎯 Что вы изучите

В этой теме вы познакомитесь с языком программирования Go, его философией и настроите окружение для разработки.

## 📚 Теоретическая часть

Go - это статически типизированный, компилируемый язык программирования, разработанный в Google. Он сочетает простоту, надежность и эффективность.

### Почему Go?

- **Простота**: Минималистичный синтаксис
- **Производительность**: Компилируется в машинный код
- **Конкурентность**: Встроенная поддержка горутин
- **Инструменты**: Богатая стандартная библиотека

## 💻 Практические примеры

### Пример 1: Hello, World!

\`\`\`go
package main

import "fmt"

func main() {
    fmt.Println("Привет, мир!")
}
\`\`\`

**Объяснение:**
- \`package main\` - объявляет исполняемый пакет
- \`import "fmt"\` - импортирует пакет для форматированного вывода
- \`func main()\` - точка входа в программу

### Пример 2: Переменные и типы

\`\`\`go
package main

import "fmt"

func main() {
    var name string = "Go"
    version := 1.21
    
    fmt.Printf("Язык: %s, Версия: %.2f\\n", name, version)
}
\`\`\`

### Пример 3: Простая функция

\`\`\`go
package main

import "fmt"

func greet(name string) string {
    return fmt.Sprintf("Привет, %s!", name)
}

func main() {
    message := greet("разработчик")
    fmt.Println(message)
}
\`\`\`

## 🎯 Практические упражнения

### Упражнение 1: Модификация приветствия

**Задача:** Измените программу Hello World, чтобы она приветствовала пользователя по имени.

### Упражнение 2: Калькулятор

**Задача:** Создайте простой калькулятор, который складывает два числа.

## 📝 Резюме

Вы познакомились с основами Go и написали свою первую программу. В следующих темах мы углубимся в синтаксис и возможности языка.
`;

        await this.createFile(join(topicDir, 'topic.md'), topicContent);
    }

    /**
     * Создание отсутствующих скриптов
     */
    async createMissingScripts() {
        const scripts = [
            'help.js',
            'bilingual-sync.js',
            'bilingual-checker.js',
            'godojo-prepare.js',
            'godojo-validator.js'
        ];

        for (const script of scripts) {
            const scriptPath = join('scripts', script);
            if (!existsSync(scriptPath)) {
                await this.createScriptStub(script);
            }
        }
    }

    /**
     * Создание заглушки скрипта
     */
    async createScriptStub(scriptName) {
        const stub = `#!/usr/bin/env node

import chalk from 'chalk';
import boxen from 'boxen';

console.log(boxen(
  chalk.yellow('🚧 В разработке\\n\\n') +
  chalk.white('Этот функционал будет добавлен в следующих версиях'),
  { 
    padding: 1, 
    borderColor: 'yellow', 
    borderStyle: 'round',
    title: '${scriptName}',
    titleAlignment: 'center'
  }
));

process.exit(0);
`;

        await this.createFile(join('scripts', scriptName), stub);
    }

    /**
     * Создание директории
     */
    async ensureDirectory(path) {
        if (!existsSync(path)) {
            await mkdir(path, { recursive: true });
            this.createdItems.push(`📁 ${path}`);
        } else {
            this.skippedItems.push(`📁 ${path}`);
        }
    }

    /**
     * Создание файла
     */
    async createFile(path, content) {
        if (!existsSync(path)) {
            await this.ensureDirectory(join(path, '..'));
            await writeFile(path, content, 'utf8');
            this.createdItems.push(`📄 ${path}`);
        } else {
            this.skippedItems.push(`📄 ${path}`);
        }
    }

    /**
     * Вывод результатов
     */
    printResults() {
        console.log(chalk.blue('\n📊 Результаты генерации:\n'));

        if (this.createdItems.length > 0) {
            console.log(chalk.green(`✅ Создано: ${this.createdItems.length}\n`));
            this.createdItems.forEach(item => {
                console.log(chalk.green(`  ${item}`));
            });
        }

        if (this.skippedItems.length > 0) {
            console.log(chalk.yellow(`\n⏭️  Пропущено (уже существует): ${this.skippedItems.length}\n`));
            if (this.skippedItems.length <= 10) {
                this.skippedItems.forEach(item => {
                    console.log(chalk.gray(`  ${item}`));
                });
            }
        }
    }

    /**
     * Показ следующих шагов
     */
    showNextSteps() {
        console.log(chalk.blue('\n🚀 Следующие шаги:\n'));
        console.log(chalk.gray('1.'), chalk.cyan('npm run author:init'), '- настройте профиль автора');
        console.log(chalk.gray('2.'), chalk.cyan('npm run author:new'), '- создайте первый контент');
        console.log(chalk.gray('3.'), chalk.cyan('git init'), '- инициализируйте Git репозиторий');
        console.log(chalk.gray('4.'), 'Прочитайте', chalk.cyan('CONTRIBUTING.md'), 'для деталей');
        console.log('');
    }
}

// Запуск
const generator = new StructureGenerator();
generator.run();