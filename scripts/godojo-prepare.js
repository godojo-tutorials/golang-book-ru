#!/usr/bin/env node

import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { join, relative, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import chalk from 'chalk';
import ora from 'ora';
import matter from 'gray-matter';
import { marked } from 'marked';
import slugify from 'slugify';

/**
 * GoDojo Prepare Tool
 * Подготавливает контент для загрузки на платформу godojo.dev
 */
class GoDojoPrepare {
    constructor() {
        this.outputDir = 'godojo-export';
        this.apiVersion = 'v1';
        this.stats = {
            categories: 0,
            topics: 0,
            exercises: 0,
            codeExamples: 0,
            totalSize: 0
        };
    }

    /**
     * Запуск подготовки
     */
    async run() {
        console.log(chalk.blue.bold('\n🚀 Подготовка контента для godojo.dev\n'));

        const spinner = ora('Инициализация...').start();

        try {
            // Проверяем сборку
            spinner.text = 'Проверка сборки контента...';
            const hasBuild = await this.checkBuild();

            if (!hasBuild) {
                spinner.info('Сборка не найдена. Запускаем content:build...');
                console.log(chalk.gray('\nСначала нужно собрать контент:'));
                console.log(chalk.cyan('npm run content:build\n'));
                process.exit(1);
            }

            // Создаем директорию для экспорта
            spinner.text = 'Создание директории экспорта...';
            await this.ensureExportDir();

            // Подготавливаем метаданные платформы
            spinner.text = 'Генерация метаданных...';
            await this.generatePlatformMetadata();

            // Оптимизируем контент
            spinner.text = 'Оптимизация контента...';
            await this.optimizeContent();

            // Генерируем индексы для поиска
            spinner.text = 'Создание поисковых индексов...';
            await this.generateSearchIndexes();

            // Создаем пакет для загрузки
            spinner.text = 'Создание пакета для загрузки...';
            await this.createUploadPackage();

            // Генерируем отчет
            spinner.text = 'Генерация отчета...';
            await this.generateReport();

            spinner.succeed('Подготовка завершена!');

            // Выводим результаты
            this.printResults();

        } catch (error) {
            spinner.fail(`Ошибка: ${error.message}`);
            console.error(chalk.red('\nДетали:'), error);
            process.exit(1);
        }
    }

    /**
     * Проверка наличия сборки
     */
    async checkBuild() {
        return existsSync('build/manifest.json');
    }

    /**
     * Создание директории экспорта
     */
    async ensureExportDir() {
        if (!existsSync(this.outputDir)) {
            await mkdir(this.outputDir, { recursive: true });
        }

        // Создаем поддиректории
        const subdirs = ['content', 'metadata', 'search', 'assets'];
        for (const subdir of subdirs) {
            const path = join(this.outputDir, subdir);
            if (!existsSync(path)) {
                await mkdir(path, { recursive: true });
            }
        }
    }

    /**
     * Генерация метаданных платформы
     */
    async generatePlatformMetadata() {
        // Загружаем манифест сборки
        const manifest = JSON.parse(await readFile('build/manifest.json', 'utf8'));

        // Создаем метаданные для godojo.dev
        const platformMeta = {
            version: this.apiVersion,
            generated: new Date().toISOString(),
            source: {
                repository: 'golang-book-ru',
                language: 'ru',
                version: manifest.version
            },
            content: {
                type: 'tutorial',
                subject: 'golang',
                level: 'beginner-to-expert',
                modules: {
                    total: 79,
                    available: manifest.stats.topics,
                    range: manifest.structure.modulesRange
                }
            },
            features: {
                exercises: true,
                codePlayground: true,
                progressTracking: true,
                certificates: false,
                multiLanguage: false
            },
            requirements: {
                runtime: 'go1.21+',
                prerequisites: ['basic-programming'],
                estimatedHours: 150
            }
        };

        await writeFile(
            join(this.outputDir, 'metadata', 'platform.json'),
            JSON.stringify(platformMeta, null, 2)
        );
    }

    /**
     * Оптимизация контента
     */
    async optimizeContent() {
        // Загружаем все темы из сборки
        const topicsIndex = JSON.parse(await readFile('build/topics-index.json', 'utf8'));

        for (const topicMeta of topicsIndex) {
            const topicPath = join('build/topics', topicMeta.category, `${topicMeta.slug}.json`);

            if (existsSync(topicPath)) {
                const topic = JSON.parse(await readFile(topicPath, 'utf8'));

                // Оптимизируем контент
                const optimized = await this.optimizeTopic(topic);

                // Сохраняем оптимизированную версию
                const outputPath = join(
                    this.outputDir,
                    'content',
                    topicMeta.category,
                    `${topicMeta.slug}.json`
                );

                await this.ensureDir(dirname(outputPath));
                await writeFile(outputPath, JSON.stringify(optimized, null, 2));

                // Обновляем статистику
                this.stats.topics++;
                this.stats.exercises += optimized.content.exercises.length;
                this.stats.codeExamples += optimized.content.examples.length;
            }
        }
    }

    /**
     * Оптимизация отдельной темы
     */
    async optimizeTopic(topic) {
        const optimized = {
            ...topic,
            content: {
                ...topic.content,
                // Конвертируем markdown в HTML для быстрого рендеринга
                theoryHtml: marked(topic.content.theory || ''),
                bestPracticesHtml: marked(topic.content.bestPractices || ''),
                commonMistakesHtml: marked(topic.content.commonMistakes || ''),
                realWorldHtml: marked(topic.content.realWorld || ''),
                summaryHtml: marked(topic.content.summary || '')
            }
        };

        // Оптимизируем примеры кода
        optimized.content.examples = topic.content.examples.map(example => ({
            ...example,
            explanationHtml: marked(example.explanation || ''),
            // Добавляем метаданные для playground
            playground: {
                template: this.generatePlaygroundTemplate(example.code),
                runnable: this.isRunnableCode(example.code),
                expectedOutput: this.extractExpectedOutput(example.explanation)
            }
        }));

        // Оптимизируем упражнения
        optimized.content.exercises = topic.content.exercises.map(exercise => ({
            ...exercise,
            contentHtml: marked(exercise.content || ''),
            // Добавляем подсказки и тесты
            hints: this.extractHints(exercise.content),
            tests: this.generateExerciseTests(exercise)
        }));

        // Добавляем навигацию
        optimized.navigation = {
            previous: this.findPreviousTopic(topic),
            next: this.findNextTopic(topic),
            category: topic.category
        };

        // Добавляем метаданные для трекинга прогресса
        optimized.progress = {
            estimatedMinutes: topic.estimatedMinutes || 30,
            difficulty: topic.difficulty,
            requiredForCertificate: topic.module <= 60,
            bonusContent: topic.module > 60
        };

        return optimized;
    }

    /**
     * Генерация шаблона для playground
     */
    generatePlaygroundTemplate(code) {
        // Если код уже полный, возвращаем как есть
        if (code.includes('package main') && code.includes('func main()')) {
            return code;
        }

        // Иначе оборачиваем в шаблон
        return `package main

import (
    "fmt"
)

func main() {
    ${code.split('\n').map(line => '    ' + line).join('\n')}
}`;
    }

    /**
     * Проверка, можно ли запустить код
     */
    isRunnableCode(code) {
        // Код можно запустить, если есть package main и func main
        return code.includes('package main') && code.includes('func main()');
    }

    /**
     * Извлечение ожидаемого вывода
     */
    extractExpectedOutput(explanation) {
        // Ищем блоки с выводом
        const outputMatch = explanation.match(/```(?:text|bash|output)?\n([\s\S]*?)```/);
        return outputMatch ? outputMatch[1].trim() : null;
    }

    /**
     * Извлечение подсказок из упражнения
     */
    extractHints(content) {
        const hints = [];
        const hintPattern = /\*\*Подсказк[аи]:\*\*\s*([\s\S]*?)(?=\n\n|\*\*|$)/g;

        let match;
        while ((match = hintPattern.exec(content)) !== null) {
            const hintText = match[1].trim();
            const hintLines = hintText.split('\n').map(line => line.replace(/^[-•]\s*/, '').trim());
            hints.push(...hintLines.filter(line => line.length > 0));
        }

        return hints;
    }

    /**
     * Генерация тестов для упражнения
     */
    generateExerciseTests(exercise) {
        // Базовые тесты на основе номера упражнения
        const tests = [];

        if (exercise.title.toLowerCase().includes('базов')) {
            tests.push({
                name: 'Компиляция',
                type: 'compile',
                description: 'Код должен компилироваться без ошибок'
            });
        }

        if (exercise.title.toLowerCase().includes('функци')) {
            tests.push({
                name: 'Наличие функции',
                type: 'function_exists',
                description: 'Должна быть определена требуемая функция'
            });
        }

        tests.push({
            name: 'Выполнение',
            type: 'run',
            description: 'Программа должна выполняться без паники'
        });

        return tests;
    }

    /**
     * Поиск предыдущей темы
     */
    findPreviousTopic(topic) {
        // Упрощенная логика - в реальности нужно использовать индекс
        if (topic.module > 1) {
            return {
                module: topic.module - 1,
                hint: 'previous_topic'
            };
        }
        return null;
    }

    /**
     * Поиск следующей темы
     */
    findNextTopic(topic) {
        // Упрощенная логика
        if (topic.module < 79) {
            return {
                module: topic.module + 1,
                hint: 'next_topic'
            };
        }
        return null;
    }

    /**
     * Генерация поисковых индексов
     */
    async generateSearchIndexes() {
        const searchIndex = {
            version: '1.0',
            generated: new Date().toISOString(),
            documents: []
        };

        // Загружаем все оптимизированные темы
        const contentDir = join(this.outputDir, 'content');
        const categories = await readdir(contentDir, { withFileTypes: true });

        for (const category of categories) {
            if (!category.isDirectory()) continue;

            const categoryPath = join(contentDir, category.name);
            const topics = await readdir(categoryPath);

            for (const topicFile of topics) {
                if (!topicFile.endsWith('.json')) continue;

                const topic = JSON.parse(await readFile(join(categoryPath, topicFile), 'utf8'));

                // Создаем поисковый документ
                searchIndex.documents.push({
                    id: `${topic.category}_${topic.slug}`,
                    title: topic.title,
                    description: topic.description,
                    category: topic.category,
                    module: topic.module,
                    difficulty: topic.difficulty,
                    tags: topic.tags || [],
                    // Текст для полнотекстового поиска
                    searchText: this.generateSearchText(topic),
                    // Веса для ранжирования
                    weight: {
                        module: topic.module,
                        difficulty: this.difficultyWeight(topic.difficulty),
                        popularity: 1.0
                    }
                });
            }
        }

        // Сохраняем индекс
        await writeFile(
            join(this.outputDir, 'search', 'index.json'),
            JSON.stringify(searchIndex, null, 2)
        );

        // Создаем также упрощенный индекс для автодополнения
        const autocomplete = searchIndex.documents.map(doc => ({
            id: doc.id,
            title: doc.title,
            category: doc.category,
            module: doc.module
        }));

        await writeFile(
            join(this.outputDir, 'search', 'autocomplete.json'),
            JSON.stringify(autocomplete, null, 2)
        );
    }

    /**
     * Генерация текста для поиска
     */
    generateSearchText(topic) {
        const parts = [
            topic.title,
            topic.description,
            topic.content.theory,
            topic.content.summary,
            ...topic.tags
        ];

        return parts
            .filter(part => part)
            .join(' ')
            .toLowerCase()
            .replace(/<[^>]*>/g, '') // Удаляем HTML
            .replace(/```[\s\S]*?```/g, '') // Удаляем код
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Вес сложности для поиска
     */
    difficultyWeight(difficulty) {
        const weights = {
            'Beginner': 1.0,
            'Intermediate': 0.8,
            'Advanced': 0.6
        };
        return weights[difficulty] || 0.5;
    }

    /**
     * Создание пакета для загрузки
     */
    async createUploadPackage() {
        const packageInfo = {
            type: 'godojo-content-package',
            version: '1.0',
            created: new Date().toISOString(),
            repository: 'golang-book-ru',
            language: 'ru',
            contents: {
                metadata: 'metadata/',
                content: 'content/',
                search: 'search/',
                assets: 'assets/'
            },
            instructions: {
                endpoint: 'https://api.godojo.dev/v1/content/upload',
                method: 'POST',
                authentication: 'Bearer token required',
                format: 'multipart/form-data'
            },
            validation: {
                checksum: await this.calculateChecksum(),
                totalSize: this.stats.totalSize,
                fileCount: await this.countFiles()
            }
        };

        await writeFile(
            join(this.outputDir, 'package.json'),
            JSON.stringify(packageInfo, null, 2)
        );
    }

    /**
     * Подсчет контрольной суммы
     */
    async calculateChecksum() {
        // Упрощенная версия - в реальности нужно использовать crypto
        return 'checksum-placeholder';
    }

    /**
     * Подсчет файлов
     */
    async countFiles() {
        // Рекурсивный подсчет всех файлов
        let count = 0;

        const countDir = async (dir) => {
            const entries = await readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    await countDir(join(dir, entry.name));
                } else {
                    count++;
                }
            }
        };

        await countDir(this.outputDir);
        return count;
    }

    /**
     * Генерация отчета
     */
    async generateReport() {
        const report = {
            generated: new Date().toISOString(),
            exportDirectory: this.outputDir,
            stats: this.stats,
            readyForUpload: true,
            nextSteps: [
                'Проверьте экспортированный контент',
                'Запустите godojo:validate для финальной проверки',
                'Получите API токен на godojo.dev',
                'Загрузите контент через API или админ-панель'
            ],
            notes: [
                'Контент оптимизирован для быстрой загрузки',
                'Добавлены поисковые индексы',
                'Код подготовлен для playground',
                'Упражнения содержат автотесты'
            ]
        };

        await writeFile(
            join(this.outputDir, 'export-report.json'),
            JSON.stringify(report, null, 2)
        );
    }

    /**
     * Создание директории
     */
    async ensureDir(dir) {
        if (!existsSync(dir)) {
            await mkdir(dir, { recursive: true });
        }
    }

    /**
     * Вывод результатов
     */
    printResults() {
        console.log(chalk.blue('\n📊 Результаты подготовки:\n'));

        console.log(chalk.gray('Категорий:'), this.stats.categories);
        console.log(chalk.gray('Тем:'), this.stats.topics);
        console.log(chalk.gray('Упражнений:'), this.stats.exercises);
        console.log(chalk.gray('Примеров кода:'), this.stats.codeExamples);

        console.log(chalk.green('\n✅ Контент готов для godojo.dev!'));
        console.log(chalk.gray('\n📁 Директория экспорта:'), chalk.cyan(this.outputDir));

        console.log(chalk.blue('\n📋 Структура экспорта:'));
        console.log(chalk.gray('  • metadata/'), '- метаданные платформы');
        console.log(chalk.gray('  • content/'), '- оптимизированный контент');
        console.log(chalk.gray('  • search/'), '- поисковые индексы');
        console.log(chalk.gray('  • package.json'), '- информация о пакете');

        console.log(chalk.yellow('\n🚀 Следующие шаги:'));
        console.log(chalk.gray('  1. Проверьте экспорт:'), chalk.cyan('npm run godojo:validate'));
        console.log(chalk.gray('  2. Получите API токен на'), chalk.cyan('godojo.dev'));
        console.log(chalk.gray('  3. Загрузите контент через API или админку\n'));
    }
}

// Запуск
const prepare = new GoDojoPrepare();
prepare.run();