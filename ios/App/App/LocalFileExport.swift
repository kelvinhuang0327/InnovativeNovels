import UIKit
import Capacitor

class NovelBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(LocalFileExportPlugin())
    }
}

// App-owned local export: no network, clipboard, or third-party share destination.
@objc(LocalFileExportPlugin)
class LocalFileExportPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "LocalFileExportPlugin"
    let jsName = "LocalFileExport"
    let pluginMethods = [CAPPluginMethod(name: "exportFile", returnType: CAPPluginReturnPromise)]
    private var activeCall: CAPPluginCall?
    private var temporaryDirectory: URL?
    private var preview: UINavigationController?
    private var failedOnce = false
    private let exportRoot = FileManager.default.temporaryDirectory.appendingPathComponent("novel-file-exports", isDirectory: true)

    override func load() {
        // Discard only this bridge's stale previews after an interrupted application.
        try? FileManager.default.removeItem(at: exportRoot)
    }

    @objc func exportFile(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in self?.prepare(call) }
    }

    private func prepare(_ call: CAPPluginCall) {
        guard activeCall == nil else {
            call.reject("An export is already open.", "EXPORT_BUSY")
            return
        }
        guard let filename = call.getString("filename"),
              !filename.isEmpty, filename.utf8.count <= 240,
              !filename.contains(where: { $0 == "/" || $0 == "\\" || $0.unicodeScalars.contains(where: { $0.value < 32 }) }),
              filename != ".", filename != "..",
              let content = call.getString("content"), !content.isEmpty,
              let data = content.data(using: .utf8), data.count <= 15 * 1024 * 1024,
              let mime = call.getString("mimeType"),
              (mime == "application/json" && filename.hasSuffix(".json")) || (mime == "text/plain" && filename.hasSuffix(".txt")) else {
            call.reject("The export file is invalid or exceeds 15 MB.", "INVALID_EXPORT")
            return
        }
        guard let presenter = bridge?.viewController, presenter.view.window != nil,
              presenter.presentedViewController == nil else {
            call.reject("The export preview cannot be opened yet.", "EXPORT_UNAVAILABLE")
            return
        }

        activeCall = call
        do {
            let documents = try FileManager.default.url(for: .documentDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
            let exportFolder = documents.appendingPathComponent("匯出", isDirectory: true)
            let chosenName = availableName(filename, in: exportFolder)
            try FileManager.default.createDirectory(at: exportRoot, withIntermediateDirectories: true)
            let temporary = exportRoot.appendingPathComponent(UUID().uuidString, isDirectory: true)
            temporaryDirectory = temporary
            try FileManager.default.createDirectory(at: temporary, withIntermediateDirectories: false)
            let source = temporary.appendingPathComponent(chosenName)
            try data.write(to: source, options: .atomic)
            let controller = LocalExportPreviewController(filename: chosenName, content: content)
            let navigation = UINavigationController(rootViewController: controller)
            navigation.isModalInPresentation = true
            controller.onCancel = { [weak self] in self?.finish(["status": "cancelled"]) }
            controller.onSave = { [weak self] in self?.save(source: source, folder: exportFolder, filename: chosenName) }
            preview = navigation
            presenter.present(navigation, animated: true)
        } catch {
            finish(nil, error: "The local export could not be prepared.")
        }
    }

    private func availableName(_ original: String, in folder: URL) -> String {
        let path = original as NSString
        let stem = path.deletingPathExtension
        let suffix = path.pathExtension
        var name = original
        var index = 2
        while FileManager.default.fileExists(atPath: folder.appendingPathComponent(name).path) {
            name = "\(stem)-\(index).\(suffix)"
            index += 1
        }
        return name
    }

    private func save(source: URL, folder: URL, filename: String) {
        do {
            #if DEBUG
            // UI acceptance exercises a real filesystem failure once, then retries normally.
            if ProcessInfo.processInfo.arguments.contains("-native-export-fail-once") && !failedOnce {
                failedOnce = true
                try Data("synthetic failure".utf8).write(to: source.appendingPathComponent("not-a-directory"))
            }
            #endif
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            // copyItem refuses an existing destination, preserving earlier exports.
            try FileManager.default.copyItem(at: source, to: folder.appendingPathComponent(filename))
            finish(["status": "saved", "filename": filename])
        } catch {
            finish(nil, error: "The file could not be saved on this device. Original data is retained.")
        }
    }

    private func finish(_ result: [String: Any]?, error: String? = nil) {
        guard let call = activeCall else { return }
        let directory = temporaryDirectory
        let navigation = preview
        let complete = { [weak self] in
            if let directory = directory { try? FileManager.default.removeItem(at: directory) }
            self?.activeCall = nil
            self?.temporaryDirectory = nil
            self?.preview = nil
            if let error = error { call.reject(error, "EXPORT_FAILED") }
            else { call.resolve(result ?? ["status": "cancelled"]) }
        }
        if navigation?.presentingViewController != nil { navigation?.dismiss(animated: true, completion: complete) }
        else { complete() }
    }
}

private class LocalExportPreviewController: UIViewController {
    var onCancel: (() -> Void)?
    var onSave: (() -> Void)?
    private let filename: String
    private let content: String

    init(filename: String, content: String) {
        self.filename = filename
        self.content = content
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError("Use init(filename:content:)") }

    override func viewDidLoad() {
        super.viewDidLoad()
        title = "本機匯出預覽"
        view.backgroundColor = .systemBackground
        navigationItem.leftBarButtonItem = UIBarButtonItem(title: "取消匯出", style: .plain, target: self, action: #selector(cancel))
        navigationItem.rightBarButtonItem = UIBarButtonItem(title: "儲存到此裝置", style: .plain, target: self, action: #selector(save))
        let name = UILabel()
        name.text = filename
        name.numberOfLines = 0
        name.font = .preferredFont(forTextStyle: .headline)
        name.accessibilityIdentifier = "native-export-filename"
        let explanation = UILabel()
        explanation.text = "確認後儲存在此 App 的「匯出」資料夾，可由「檔案」App 查看。取消會保留原有筆記和草稿。"
        explanation.numberOfLines = 0
        explanation.font = .preferredFont(forTextStyle: .footnote)
        let text = UITextView()
        text.text = content
        text.isEditable = false
        text.font = .preferredFont(forTextStyle: .body)
        text.accessibilityLabel = "匯出檔案內容"
        text.accessibilityIdentifier = "native-export-content"
        let stack = UIStackView(arrangedSubviews: [name, explanation, text])
        stack.axis = .vertical
        stack.spacing = 12
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 20),
            stack.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -20),
            stack.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 16),
            stack.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -16)
        ])
    }

    @objc private func cancel() {
        navigationItem.leftBarButtonItem?.isEnabled = false
        navigationItem.rightBarButtonItem?.isEnabled = false
        onCancel?()
    }

    @objc private func save() {
        navigationItem.leftBarButtonItem?.isEnabled = false
        navigationItem.rightBarButtonItem?.isEnabled = false
        onSave?()
    }
}
