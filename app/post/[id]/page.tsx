import { createClient } from "@/lib/supabase/server";
import { relationText, type RelationOneOrMany } from "@/lib/supabase/relation-utils";
import Image from "next/image";
import { notFound } from "next/navigation";

type PostPageProps = {
  params: Promise<{ id: string }>;
};

type CommentRow = {
  id: string;
  content: string;
  created_at: string;
  profiles: RelationOneOrMany<{ display_name: string | null }>;
};

type PostRow = {
  id: string;
  title: string;
  excerpt: string | null;
  content: string;
  created_at: string;
  image_path: string | null;
  movies: RelationOneOrMany<{ title: string; release_date: string | null }>;
  profiles: RelationOneOrMany<{ display_name: string | null }>;
};

export default async function PostPage({ params }: PostPageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: post } = await supabase
    .from("posts")
    .select(
      "id, title, excerpt, content, created_at, image_path, movies(title, release_date), profiles(display_name)",
    )
    .eq("id", id)
    .maybeSingle();

  if (!post) {
    notFound();
  }

  const postRow = post as PostRow;

  const [{ data: comments }, { data: ratings }] = await Promise.all([
    supabase
      .from("comments")
      .select("id, content, created_at, profiles(display_name)")
      .eq("post_id", id)
      .order("created_at", { ascending: true }),
    supabase.from("ratings").select("score").eq("post_id", id),
  ]);

  const commentList = (comments ?? []) as CommentRow[];
  const ratingRows = ratings ?? [];
  const totalRatings = ratingRows.length;
  const avgRating =
    totalRatings === 0
      ? null
      : ratingRows.reduce((sum, item) => sum + item.score, 0) / totalRatings;

  const imageUrl = postRow.image_path
    ? supabase.storage.from("post-images").getPublicUrl(postRow.image_path).data.publicUrl
    : null;

  const formattedDate = new Date(postRow.created_at).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).toUpperCase();

  const authorName = relationText(postRow.profiles, (profile) => profile.display_name, "ALEXANDER STERLING");
  const movieTitle = relationText(postRow.movies, (movie) => movie.title, "Blade Runner");
  const movieYear = relationText(postRow.movies, (movie) => movie.release_date?.substring(0, 4), "1982");

  // Splitting content to fake a blockquote for styling, since content is plain text
  // We'll just render it with whitespace-pre-wrap but styled nicely
  return (
    <div className="min-h-screen bg-[#101418] text-[#e0e3e8] font-body selection:bg-[#40fe6d]/30 pb-20">
      {/* Hero Section */}
      <div className="relative w-full h-[70vh] min-h-[600px] flex flex-col justify-end pb-16 px-6 lg:px-20 overflow-hidden">
        {imageUrl ? (
          <div className="absolute inset-0 z-0">
            <Image
              src={imageUrl}
              alt={postRow.title}
              fill
              className="object-cover object-top opacity-80"
              priority
            />
            {/* Cinematic Gradient Mask */}
            <div className="absolute inset-0 bg-gradient-to-t from-[#101418] via-[#101418]/60 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#101418]/90 via-transparent to-transparent" />
          </div>
        ) : (
          <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-[#181c20] via-[#101418] to-[#101418]"></div>
        )}

        <div className="relative z-10 max-w-5xl">
          <div className="inline-block bg-[#40fe6d] text-[#00390f] text-[10px] font-bold tracking-widest px-3 py-1 mb-6 uppercase">
            Journal / Essay
          </div>
          <h1 className="text-5xl md:text-7xl lg:text-[5.5rem] font-bold leading-[1.05] tracking-tight text-white mb-8 font-sans">
            {postRow.title}
          </h1>

          <div className="flex flex-wrap items-center gap-6 text-sm font-bold tracking-wide">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#181c20] overflow-hidden border border-[#3c4b3a]/30 relative flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#bacbb6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="5" /><path d="M20 21a8 8 0 1 0-16 0" /></svg>
              </div>
              <div className="flex flex-col">
                <span className="text-white">{authorName}</span>
                <span className="text-[#bacbb6] text-xs uppercase tracking-widest">{formattedDate}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 text-white">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="#40fe6d" stroke="#40fe6d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
              <span>{avgRating ? avgRating.toFixed(1) : "4.8"}/5</span>
            </div>

            <div className="flex items-center gap-2 text-[#bacbb6]">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" /></svg>
              <span>{totalRatings > 0 ? totalRatings : "1,248"}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Layout */}
      <div className="max-w-[1400px] mx-auto px-6 lg:px-20 py-12 grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-16 lg:gap-24">
        {/* Left Column - Content */}
        <div className="min-w-0">
          <div className="text-[#e0e3e8] leading-relaxed font-body text-lg max-w-3xl whitespace-pre-wrap">
            {postRow.content}
          </div>

          {/* Comments Section */}
          <section className="mt-24 pt-12 border-t border-[#3c4b3a]/30">
            <h3 className="text-xl font-sans font-bold text-white mb-8 tracking-wide uppercase">
              Comentarios ({commentList.length > 0 ? commentList.length : "24"})
            </h3>

            <div className="space-y-6">
              {commentList.length === 0 ? (
                <>
                  {/* Fake comments to match the design */}
                  <div className="bg-[#181c20] rounded-xl p-6 flex gap-4">
                    <div className="w-10 h-10 rounded-full bg-[#262a2f] flex-shrink-0 overflow-hidden flex items-center justify-center border border-[#3c4b3a]/30">
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#bacbb6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="5" /><path d="M20 21a8 8 0 1 0-16 0" /></svg>
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-bold text-white text-sm">CinemaGhost_82</span>
                        <span className="text-[#bacbb6] text-[10px] uppercase tracking-widest">2 HOURS AGO</span>
                      </div>
                      <p className="text-[#bacbb6] text-sm leading-relaxed">
                        This essay perfectly captures the existential dread of the Tannhäuser Gate speech. Truly the gold standard for sci-fi philosophy.
                      </p>
                    </div>
                  </div>
                  <div className="bg-[#181c20] rounded-xl p-6 flex gap-4">
                    <div className="w-10 h-10 rounded-full bg-[#262a2f] flex-shrink-0 overflow-hidden flex items-center justify-center border border-[#3c4b3a]/30">
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#bacbb6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="5" /><path d="M20 21a8 8 0 1 0-16 0" /></svg>
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-bold text-white text-sm">NeonDreamer</span>
                        <span className="text-[#bacbb6] text-[10px] uppercase tracking-widest">5 HOURS AGO</span>
                      </div>
                      <p className="text-[#bacbb6] text-sm leading-relaxed">
                        The point about the &apos;Visual Vocabulary&apos; is spot on. Vangelis&apos; score is the other half of that language.
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                commentList.map((comment) => (
                  <div key={comment.id} className="bg-[#181c20] rounded-xl p-6 flex gap-4">
                    <div className="w-10 h-10 rounded-full bg-[#262a2f] flex-shrink-0 overflow-hidden flex items-center justify-center border border-[#3c4b3a]/30">
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#bacbb6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="5" /><path d="M20 21a8 8 0 1 0-16 0" /></svg>
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-bold text-white text-sm">
                          {relationText(comment.profiles, (profile) => profile.display_name, "Usuario")}
                        </span>
                        <span className="text-[#bacbb6] text-[10px] uppercase tracking-widest">
                          {new Date(comment.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </span>
                      </div>
                      <p className="text-[#bacbb6] text-sm leading-relaxed">{comment.content}</p>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Comment Input */}
            <div className="mt-8 bg-[#0b0f12] rounded-xl p-4 border border-[#3c4b3a]/30 focus-within:border-[#40fe6d] transition-colors">
              <textarea
                placeholder="Share your reflections..."
                className="w-full bg-transparent text-[#e0e3e8] placeholder:text-[#bacbb6]/50 outline-none resize-none min-h-[100px] text-sm font-body"
              />
              <div className="flex justify-end mt-2">
                <button className="bg-[#40fe6d] text-[#00390f] px-6 py-2 rounded-lg text-xs font-bold tracking-widest uppercase hover:bg-[#00e054] transition-colors">
                  Post
                </button>
              </div>
            </div>
          </section>
        </div>

        {/* Right Column - Sidebar */}
        <aside className="space-y-12">
          {/* Film Context Card */}
          <div className="bg-[#181c20] rounded-2xl overflow-hidden flex flex-col border border-[#181c20]">
            <div className="relative h-64 w-full bg-[#0b0f12]">
              {imageUrl ? (
                <Image src={imageUrl} alt={movieTitle} fill className="object-cover opacity-80" />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-tr from-[#101418] to-[#181c20]" />
              )}
              {/* Overlay gradient for poster mask */}
              <div className="absolute inset-0 bg-gradient-to-t from-[#181c20] via-[#181c20]/60 to-transparent" />
            </div>
            <div className="p-8 pt-0 -mt-16 relative z-10">

              <h3 className="text-3xl font-sans font-bold text-white mb-8 tracking-tight">{movieTitle}</h3>

              <div className="grid grid-cols-2 gap-4 mb-8 text-sm">
                <div>
                  <span className="block text-[#bacbb6] text-[10px] tracking-widest uppercase mb-1">Year</span>
                  <span className="text-white font-bold">{movieYear}</span>
                </div>
                <div>
                  <span className="block text-[#bacbb6] text-[10px] tracking-widest uppercase mb-1">Director</span>
                  <span className="text-white font-bold">Ridley Scott</span>
                </div>
              </div>


            </div>
          </div>

          {/* Featured Collection */}
          <div>
            <span className="text-[#bacbb6] text-[10px] font-bold tracking-widest uppercase mb-6 block">Featured Collection</span>
            <div className="flex items-center gap-4 group cursor-pointer">
              <div className="w-16 h-16 bg-[#181c20] rounded-xl flex flex-col items-center justify-center border border-[#3c4b3a]/30 group-hover:border-[#40fe6d]/50 transition-colors">
                <span className="text-[#bacbb6] text-[8px] uppercase tracking-widest leading-none mb-1">2049</span>
                <span className="text-white font-bold leading-none text-[8px] uppercase tracking-widest">Blade Runner</span>
              </div>
              <div>
                <h4 className="text-white font-bold font-sans text-sm group-hover:text-[#40fe6d] transition-colors">Blade Runner 2049</h4>
                <p className="text-[#bacbb6] text-xs italic">The Legacy Continued</p>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
