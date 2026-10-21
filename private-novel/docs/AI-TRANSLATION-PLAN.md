# AI-0 — nghiên cứu dịch Gemini

08/10/2026 16:14 ICT, rootCodex. User yêu cầu nghiên cứu/ưu tiênGemini và cung cấpcredentials; chưa gọi API vớikeys/chưa lưukeys/chưadeployAI. rgsrc/server khôngthấyGemini/generateContent/DịchAI (exit1 nghĩa no matches). Production02a02f53 vẫnTTS/Convert, khôngAI.

## Đề xuất sản phẩm
Một nút Dịch AI trong Công cụ Reader, trước tiên chọnđoạn/chươnghiệntại, khôngdịchtoànkhotựđộng. Gemini3.5Flash-Lite ứngviênưu tiên tốcđộ/free-tiertranslation theo pricingofficial; chấtlượngso vớiFlash cầnbenchmarkChinese tổng hợp trướcchốt. Khônghardcodemodelchưađượckey/projectquyềntruycập; dùnglistmodels/permissionchecktrongspike. Groqgsk keys riêng, khônggửiGoogle/khôngauto fallbackGemini→Groq.

ĐọcRAWTrung làmđầu vào +glossary Namescủatruyện/globalexplicit ưu tiênnamestruyện, chỉcácNamesmatchđoạn. Prompt giữnghĩa/thứtựđoạn/xưnghô, khôngbịa/thêm/xóanộidung; khôngcoi instructions trongtruyện làsysteminstructions. TrảđoạnJSONcóID; validateID/thứtự/nonempty/finishReason/truncation/safetyblock. AI khôngbảođảm100%Names; đánhdấuvi phạm glossaryđểreview, khôngtựregexreplace arbitraryphrases.

Chiađoạntheođoạnvăn/tokenbudget, 1jobactive, stop/cancel+generation, giữkếtquảđãxongcheckpoint. Không streamcáckýtựvàoReadergâynhấpmàn; phầnpreview riêng, chỉđổi display khiđoạnđủ. Snapshot RAW/chapterid/revision/Nameshash/model/promptversion; sourcechangeinvalidateresult, joblatekhôngcommit. Cacheoutput theoSHA raw+glossary+model+prompt, khônglưukey. KhôngghiđèRAW/Convert, AIresult bảnriêng; thiết kếschema/cachemigration+backupcompat cầnreviewđộc lập trướcimplementationpersist. KhôngmapwordEditAItext giảvờ1-1offsetTrung; sửaName dùngRAW/Convert, thayNameinvalidateAIdraft.

## Keys và backend
SecretchỉserverCloudflarePagesFunctions/Workers, khôngVITE/bundle/Git/log/browserlocalStorage hoặc xuấtbackup. Keysđãxuấthiệnchatnênrotate trướcproduction; khôngcopypastedkeys vàoartifact. Keyring theo project/provider/model eligibility. 429backoffRetryInfo/Retry-After+jitter/maxattempt/deadline; cùngprojectcooldownchung, khôngxoaykeyđểvượthạnmức. 401/403invalid/permission disableappropriatecredential, khônginrequestheaders/fullerrorcredential. Khôngcamkết0VNĐ bằngprefixkey: billing/projectfreequota cầnkiểm ởAIStudio, don'tautoenablebilling.

WebPUBLIC_LIBRARY1 aiURLadmin; khôngdeployanonendpointdùngownerkeys. ChỉbảovệrouteAI bằngseparatecapability/auth/quota/requesttokenlimits, giữpubliclibrarytheoquyếtđịnhcũ. CORS/sameorigin khôngthaythếauthentication. Luồngnhậpkết nốiAIan toàn, secret khôngtrongURL; thiếtkếauth/CSRF/ratebudget cầnmodelmạnh+independentreviewer. ChưaquyếtđịnhautopublicsharedAI. FreeGemini dữliệu cóthểdùngcảithiệnproducts theo bảngpricing, thôngbáotrướcgửi vàchỉselectedtext.

## Spike/kế hoạch nhỏ
AI-1: credentialcheck ngoàiworkspaceGit, khôngecho/secretdump; usercho phép dùngkeys khôngđồngnghĩađãverifiedkeys. Modelavailability/freeeligibility+tinyChinese translation benchmark3short syntheticparagraphs, comparelatency/tokenusage/meaning/Names. Chưađo/chưachạythậtlàchưaxácminh.
AI-2: protectedserveradapter/keyring/projectcooldown+mocktimeouts429401403500/outputvalidation, no paidfallback; authreviewđộc lập vàtestregression.
AI-3: Readerpreview/jobstop/checkpoint/cacheidentity giữRAW/Convert; requiredunit/build/relatedE2Erepeat3; validationrealChineseoutput+Androidmanual. KhôngthêmTTSprovider hoặcbulkuploadDtrongscope.

## Nguồn official đãđọc
- https://ai.google.dev/gemini-api/docs/rate-limits : projectnotkey/RPMTPMRPD, activequotaAIStudio.
- https://ai.google.dev/gemini-api/docs/api-key : khôngclientproductionkeys/backendproxy.
- https://ai.google.dev/gemini-api/docs/models : modelIDs hiệnhành, khôngpermissionproof.
- https://ai.google.dev/gemini-api/docs/pricing : Gemini3.5Flash-Litefreeinput/output/translation; freedatause.


## AI-1 — 08/10/2026 16:20 ICT: một key đã thử thật, prompt tương thích thao tác STV
Userchọn1keytest+thamkhảopromptshare4308. ChỉkeyGemini#1theothứtựuser, khônglưugiátrịkeytrongfile/Git/bundle/log. GETv1beta/models200, candidateavailablegemini-3.5-flash-lite; POSTgenerateContent200,1.04s,finishReasonSTOP,input87/output42/total129tokens. Đây là1shortsyntheticfixture, khôngbenchmarktoànchương/khôngproofallkeys/freebillingtier.

Input synthetic: 林儿推开窗，看见张明站在院子里。他说：“等了十分钟，我们终于可以出发了。” Names 林儿=Lâm Nhi;张明=Trương Minh.
Output: Lâm Nhi đẩy cửa sổ ra, nhìn thấy Trương Minh đang đứng ở trong sân. Cậu ấy nói: “Đợi mười phút rồi, chúng ta cuối cùng cũng có thể xuất phát.”
Namescorrect/sốviếtchữ đúng, cócáchxưnghôCậuấytheo ngữcảnhngắnchưađủ, khônggọi100%parity/chấtlượngtruyệndài.

WebfetchshareURLfailedInternalError, fallbackCUAexistingtabDOMreadonlyconfirmtitleAudio12345/descriptiongemini3/System+User/temperature0/Test. URL https://sangtacviet.vip/prompts/?shareId=4308 . Descriptionmetadata khônggửiAI; templateUser cần{{text}}, tùychọn{{name}}; systemcho{{language}}. Promptreferenceưu tiênvănViệttrôichảy/Nameshậu tốNhi/sốthànhchữ/chỉoutputdịch/cuối♾. Khôngcopypromptnguyênvăn hoặcgọiSTVinternalAPI, khôngclickLưu/Chạythử/truyềnkeySTV.

ThiếtkếAI-3UI: 1Côngcụ→DịchAI, mặcđịnhGemini; CustomPromptthu gọn vớiTiêuđề/Giớithiệu/System/User/temperature vàsmallChineseTest. Lưu promptpreset tronglocalsettings(no key), chọnpresettheotruyện, export/importprompt-only(no secrets). Previewkếtquả, chỉlưubảnAIriêngkhiuserchọn; RAW/Convert/nameeditinggiữ. Templateexpandonesinglepass{{text}}/{{name}}/{{language}}; validatebắtbuộctext trướcjob; rawtextkhôngbịrecursiveexpansion/sentencescommands trongtruyện khôngsysteminstr. Promptversion/hash phải trongcacheidentity đểsửapromptkhôngdùngkếtquảcũ. Khôngcópromptsharedcatalog/communityclone trongMVP.

Preset đềxuất tựviết: System yêu cầudịchtựnhiên/giữnghĩa/Names/numbersTTS/noextraoutput. User:
{{name}}
Nguồn cần dịch sang {{language}}:
{{text}}
Marker♾ nếuuserpromptyêucầu thìchỉvalidate/removeởlớpTTS riêng, khôngsendkýhiệuriêng gây500; noautocopy marker hoặccho rằngmọipromptcầnmarker. Khôngsửa safetyfilterđểnéblockedcontent.

Chưaappcode/backend/protectedAIroute/prompteditor/deployAI. Credentialoneverifiednottreatedpermanentsecretdeployment; otherkeys/provider/accounttierunverified. NextAI2protectedserveradapter trướcproductionUIconnect, independentauth/datareviewgatesmaintained.
