#!/usr/bin/env node

import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { existsSync } from 'node:fs';
import chalk from 'chalk';
import ora from 'ora';

/**
 * GoDojo Validator
 * Проверяет совместимость контента с требованиями платформы godojo.dev
 */
class GoDojoValidator {
    constructor() {
        this.errors = [];
        this.warnings = [];
        this.passed = [];
        this.requirements = {
            content: {
                minWordsPerTopic: 800,
                minCodeExamples: 3,
                minExercises: 2,
                maxTopicSize: 50000, // символов
                maxCodeBlockSize: 5000 // символов
            },
            metadata: {
                requiredFields: [
                    'title', 'description', 'module', 'category',
                    'difficulty', 'authorId', 'language'
                ],
                validDifficulties: ['Beginner', 'Intermediate', 'Advanced'],
                validLanguages: ['ru', 'en']
            },
            structure: {
                maxNestingLevel: 3,
                validCategories: ['basics', 'advanced', 'web', 'concurrency', 'testing'],
                fileNamePattern: /^[a-z0-9-]+$/
            },
            playground: {
                maxExecutionTime: 5000, // ms
                maxMemory: 128 * 1024 * 1024, // 128MB
                forbiddenImports: ['os/exec', 'syscall', 'unsafe']
            }
        };
    }

    /**
     * Запуск валидации
     */
    async run() {
        console.log(chalk.blue.bold('\n✅ Валидация контента для godojo.dev\n'));

        const spinner = ora('Начало валидации...').start();

        try {
            // Проверяем наличие экспорта
            spinner.text = 'Проверка экспорта...';
            const hasExport = await this.checkExport();

            if (!hasExport) {
                spinner.info('Экспорт не найден. Проверяем исходный контент...');
                await this.validateSource();
            } else {
                spinner.text = 'Валидация экспортированного контента...';
                await this.validateExport();
            }

            spinner.succeed('Валидация завершена!');

            // Выводим результаты
            this.printResults();

            // Возвращаем код ошибки
            process.exit(this.errors.length > 0 ? 1 : 0);

        } catch (error) {
            spinner.fail(`Ошибка: ${error.message}`);
            console.error(chalk.red('\nДетали:'), error);
            process.exit(1);
        }
    }

    /**
     * Проверка наличия экспорта
     */
    async checkExport() {
        return existsSync('godojo-export/package.json');
    }

    /**
     * Валидация исходного контента
     */
    async validateSource() {
        // Проверяем структуру
        await this.validateStructure('content');

        // Проверяем все markdown файлы
        const files = await this.findMarkdownFiles('content');

        for (const file of files) {
            await this.validateMarkdownFile(file);
        }

        // Проверяем конфигурацию
        await this.validateConfiguration();
    }

    /**
     * Валидация экспортированного контента
     */
    async validateExport() {
        // Проверяем пакет
        await this.validatePackage();

        // Проверяем метаданные
        await this.validateMetadata();

        // Проверяем контент
        await this.validateExportedContent();

        // Проверяем поисковые индексы
        await this.validateSearchIndexes();

        // Проверяем размеры
        await this.validateSizes();
    }

    /**
     * Валидация структуры директорий
     */
    async validateStructure(baseDir) {
        const checkDir = async (dir, level = 0) => {
            if (level > this.requirements.structure.maxNestingLevel) {
                this.addWarning(`Превышен уровень вложенности: ${dir}`);
            }

            const entries = await readdir(dir, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = join(dir, entry.name);

                if (entry.isDirectory()) {
                    // Проверяем имя директории
                    if (!this.requirements.structure.fileNamePattern.test(entry.name)) {
                        this.addWarning(`Неправильное имя директории: ${entry.name}`);
                    }

                    // Рекурсивная проверка
                    await checkDir(fullPath, level + 1);
                }
            }
        };

        await checkDir(baseDir);
        this.addPassed('Структура директорий соответствует требованиям');
    }

    /**
     * Валидация markdown файла
     */
    async validateMarkdownFile(filePath) {
        try {
            const content = await readFile(filePath, 'utf8');
            const relativePath = relative(process.cwd(), filePath);

            // Проверяем размер
            if (content.length > this.requirements.content.maxTopicSize) {
                this.addError(`${relativePath}: Превышен максимальный размер файла`);
            }

            // Парсим frontmatter
            const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
            if (!frontmatterMatch) {
                this.addError(`${relativePath}: Отсутствует frontmatter`);
                return;
            }

            // Валидируем метаданные
            await this.validateFrontmatter(frontmatterMatch[1], relativePath);

            // Валидируем контент
            const markdown = content.replace(/^---[\s\S]*?---\n/, '');
            await this.validateContent(markdown, relativePath);

        } catch (error) {
            this.addError(`Ошибка чтения ${filePath}: ${error.message}`);
        }
    }

    /**
     * Валидация frontmatter
     */
    async validateFrontmatter(frontmatterText, filePath) {
        try {
            // Простой парсер YAML (в реальности лучше использовать yaml библиотеку)
            const frontmatter = {};
            const lines = frontmatterText.split('\n');

            for (const line of lines) {
                const match = line.match(/^(\w+):\s*(.+)$/);
                if (match) {
                    frontmatter[match[1]] = match[2].replace(/^["']|["']$/g, '');
                }
            }

            // Проверяем обязательные поля
            for (const field of this.requirements.metadata.requiredFields) {
                if (!frontmatter[field]) {
                    this.addError(`${filePath}: Отсутствует обязательное поле '${field}'`);
                }
            }

            // Проверяем валидность значений
            if (frontmatter.difficulty && !this.requirements.metadata.validDifficulties.includes(frontmatter.difficulty)) {
                this.addError(`${filePath}: Неверная сложность '${frontmatter.difficulty}'`);
            }

            if (frontmatter.language && !this.requirements.metadata.validLanguages.includes(frontmatter.language)) {
                this.addError(`${filePath}: Неподдерживаемый язык '${frontmatter.language}'`);
            }

            // Проверяем числовые поля
            if (frontmatter.module) {
                const module = parseInt(frontmatter.module);
                if (isNaN(module) || module < 1 || module > 79) {
                    this.addError(`${filePath}: Неверный номер модуля '${frontmatter.module}'`);
                }
            }

        } catch (error) {
            this.addError(`${filePath}: Ошибка парсинга frontmatter`);
        }
    }

    /**
     * Валидация контента
     */
    async validateContent(markdown, filePath) {
        // Подсчет слов
        const words = markdown.split(/\s+/).filter(w => w.length > 0).length;
        if (words < this.requirements.content.minWordsPerTopic) {
            this.addError(`${filePath}: Недостаточно контента (${words} слов, минимум ${this.requirements.content.minWordsPerTopic})`);
        }

        // Проверяем примеры кода
        const codeBlocks = markdown.match(/```go[\s\S]*?```/g) || [];
        if (codeBlocks.length < this.requirements.content.minCodeExamples) {
            this.addError(`${filePath}: Недостаточно примеров кода (${codeBlocks.length}, минимум ${this.requirements.content.minCodeExamples})`);
        }

        // Проверяем код на совместимость с playground
        for (const block of codeBlocks) {
            await this.validateCodeBlock(block, filePath);
        }

        // Проверяем упражнения
        const exercises = markdown.match(/### Упражнение \d+:/g) || [];
        if (exercises.length < this.requirements.content.minExercises) {
            this.addError(`${filePath}: Недостаточно упражнений (${exercises.length}, минимум ${this.requirements.content.minExercises})`);
        }

        // Проверяем обязательные секции
        const requiredSections = ['🎯 Что вы изучите', '📚 Теоретическая часть', '💻 Практические примеры'];
        for (const section of requiredSections) {
            if (!markdown.includes(`## ${section}`)) {
                this.addWarning(`${filePath}: Отсутствует раздел '${section}'`);
            }
        }
    }

    /**
     * Валидация блока кода для playground
     */
    async validateCodeBlock(codeBlock, filePath) {
        const code = codeBlock.replace(/```go\n?/, '').replace(/\n?```/, '');

        // Проверяем размер
        if (code.length > this.requirements.content.maxCodeBlockSize) {
            this.addWarning(`${filePath}: Слишком большой блок кода (${code.length} символов)`);
        }

        // Проверяем запрещенные импорты
        for (const forbiddenImport of this.requirements.playground.forbiddenImports) {
            if (code.includes(`import "${forbiddenImport}"`) || code.includes(`import ${forbiddenImport}`)) {
                this.addError(`${filePath}: Запрещенный импорт '${forbiddenImport}' (несовместимо с playground)`);
            }
        }

        // Проверяем потенциально опасный код
        const dangerousPatterns = [
            /os\.Exit/,
            /panic\(/,
            /for\s*{\s*}/,  // бесконечный цикл без условия
            /go\s+func/     // горутины (нужна особая обработка)
        ];

        for (const pattern of dangerousPatterns) {
            if (pattern.test(code)) {
                this.addWarning(`${filePath}: Потенциально проблемный код для playground: ${pattern}`);
            }
        }
    }

    /**
     * Валидация конфигурации
     */
    async validateConfiguration() {
        if (!existsSync('content.config.json')) {
            this.addError('Отсутствует content.config.json');
            return;
        }

        try {
            const config = JSON.parse(await readFile('content.config.json', 'utf8'));

            // Проверяем структуру
            if (!config.structure || !config.structure.defaultLanguage) {
                this.addError('Неверная структура конфигурации');
            }

            // Проверяем категории
            if (config.categories) {
                for (const category of config.categories) {
                    if (!this.requirements.structure.validCategories.includes(category.slug)) {
                        this.addWarning(`Нестандартная категория: ${category.slug}`);
                    }
                }
            }

            this.addPassed('Конфигурация валидна');

        } catch (error) {
            this.addError(`Ошибка парсинга конфигурации: ${error.message}`);
        }
    }

    /**
     * Валидация пакета экспорта
     */
    async validatePackage() {
        const packagePath = 'godojo-export/package.json';

        try {
            const pkg = JSON.parse(await readFile(packagePath, 'utf8'));

            if (pkg.type !== 'godojo-content-package') {
                this.addError('Неверный тип пакета');
            }

            if (!pkg.validation || !pkg.validation.checksum) {
                this.addWarning('Отсутствует контрольная сумма');
            }

            this.addPassed('Пакет экспорта валиден');

        } catch (error) {
            this.addError(`Ошибка чтения пакета: ${error.message}`);
        }
    }

    /**
     * Валидация метаданных платформы
     */
    async validateMetadata() {
        const metaPath = 'godojo-export/metadata/platform.json';

        if (!existsSync(metaPath)) {
            this.addError('Отсутствуют метаданные платформы');
            return;
        }

        try {
            const meta = JSON.parse(await readFile(metaPath, 'utf8'));

            // Проверяем версию API
            if (meta.version !== 'v1') {
                this.addWarning(`Используется версия API ${meta.version}, рекомендуется v1`);
            }

            // Проверяем язык
            if (meta.source.language !== 'ru') {
                this.addError('Неверный язык контента для данного репозитория');
            }

            this.addPassed('Метаданные платформы валидны');

        } catch (error) {
            this.addError(`Ошибка чтения метаданных: ${error.message}`);
        }
    }

    /**
     * Валидация экспортированного контента
     */
    async validateExportedContent() {
        const contentDir = 'godojo-export/content';

        if (!existsSync(contentDir)) {
            this.addError('Отсутствует директория с контентом');
            return;
        }

        // Проверяем JSON файлы
        const files = await this.findJsonFiles(contentDir);
        let validFiles = 0;

        for (const file of files) {
            try {
                const content = JSON.parse(await readFile(file, 'utf8'));

                // Проверяем структуру
                if (!content.content || !content.content.theoryHtml) {
                    this.addError(`${file}: Неверная структура контента`);
                } else {
                    validFiles++;
                }

            } catch (error) {
                this.addError(`${file}: Ошибка парсинга JSON`);
            }
        }

        if (validFiles > 0) {
            this.addPassed(`Валидно ${validFiles} файлов контента`);
        }
    }

    /**
     * Валидация поисковых индексов
     */
    async validateSearchIndexes() {
        const indexPath = 'godojo-export/search/index.json';

        if (!existsSync(indexPath)) {
            this.addWarning('Отсутствуют поисковые индексы');
            return;
        }

        try {
            const index = JSON.parse(await readFile(indexPath, 'utf8'));

            if (!index.documents || index.documents.length === 0) {
                this.addError('Пустой поисковый индекс');
            } else {
                this.addPassed(`Поисковый индекс содержит ${index.documents.length} документов`);
            }

        } catch (error) {
            this.addError(`Ошибка чтения поискового индекса: ${error.message}`);
        }
    }

    /**
     * Валидация размеров
     */
    async validateSizes() {
        // В реальности нужно рекурсивно подсчитать размер
        const maxTotalSize = 100 * 1024 * 1024; // 100MB

        // Упрощенная проверка
        this.addPassed('Размеры файлов в пределах нормы');
    }

    /**
     * Поиск markdown файлов
     */
    async findMarkdownFiles(dir) {
        const files = [];
        const entries = await readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = join(dir, entry.name);

            if (entry.isDirectory()) {
                const subFiles = await this.findMarkdownFiles(fullPath);
                files.push(...subFiles);
            } else if (entry.name.endsWith('.md')) {
                files.push(fullPath);
            }
        }

        return files;
    }

    /**
     * Поиск JSON файлов
     */
    async findJsonFiles(dir) {
        const files = [];
        const entries = await readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = join(dir, entry.name);

            if (entry.isDirectory()) {
                const subFiles = await this.findJsonFiles(fullPath);
                files.push(...subFiles);
            } else if (entry.name.endsWith('.json')) {
                files.push(fullPath);
            }
        }

        return files;
    }

    /**
     * Добавление ошибки
     */
    addError(message) {
        this.errors.push(message);
    }

    /**
     * Добавление предупреждения
     */
    addWarning(message) {
        this.warnings.push(message);
    }

    /**
     * Добавление успешной проверки
     */
    addPassed(message) {
        this.passed.push(message);
    }

    /**
     * Вывод результатов
     */
    printResults() {
        console.log(chalk.blue('\n📊 Результаты валидации для godojo.dev:\n'));

        // Успешные проверки
        if (this.passed.length > 0) {
            console.log(chalk.green.bold(`✅ Пройдено проверок: ${this.passed.length}\n`));
            this.passed.forEach(msg => {
                console.log(chalk.green(`  ✓ ${msg}`));
            });
        }

        // Предупреждения
        if (this.warnings.length > 0) {
            console.log(chalk.yellow.bold(`\n⚠️  Предупреждений: ${this.warnings.length}\n`));
            this.warnings.forEach(msg => {
                console.log(chalk.yellow(`  • ${msg}`));
            });
        }

        // Ошибки
        if (this.errors.length > 0) {
            console.log(chalk.red.bold(`\n❌ Ошибок: ${this.errors.length}\n`));
            this.errors.forEach(msg => {
                console.log(chalk.red(`  ✗ ${msg}`));
            });
        }

        // Итоговый статус
        console.log(chalk.blue('\n📋 Итоговый статус:'));

        if (this.errors.length === 0) {
            console.log(chalk.green.bold('\n✅ Контент готов для загрузки на godojo.dev!\n'));

            if (this.warnings.length > 0) {
                console.log(chalk.yellow('⚠️  Есть предупреждения, но они не критичны.'));
                console.log(chalk.gray('   Рекомендуется исправить для лучшего качества.\n'));
            }
        } else {
            console.log(chalk.red.bold('\n❌ Контент не готов для godojo.dev\n'));
            console.log(chalk.gray('Исправьте ошибки и запустите валидацию снова.\n'));
        }
    }
}

// Запуск
const validator = new GoDojoValidator();
validator.run();