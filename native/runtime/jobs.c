/* Blocking native adapters run on bounded OS workers. Workers receive C buffers
 * only, never Arya values, GC roots, callbacks or compiler state. */
#include <pthread.h>
#include <fcntl.h>
typedef struct AJob AJob;
struct AJob{AJob *next;pthread_t thread;int pipe[2];void (*run)(void *);void *data;};
static AJob *ajobs;
static size_t ajob_count;
static unsigned ajobs_running;
static pthread_mutex_t ajobs_mutex=PTHREAD_MUTEX_INITIALIZER;
static pthread_cond_t ajobs_condition=PTHREAD_COND_INITIALIZER;
static void *ajob_worker(void *argument){AJob *job=(AJob*)argument;pthread_mutex_lock(&ajobs_mutex);while(ajobs_running>=2)pthread_cond_wait(&ajobs_condition,&ajobs_mutex);ajobs_running++;pthread_mutex_unlock(&ajobs_mutex);
  job->run(job->data);
  pthread_mutex_lock(&ajobs_mutex);ajobs_running--;pthread_cond_broadcast(&ajobs_condition);pthread_mutex_unlock(&ajobs_mutex);
  char ready=1;ssize_t count;do{count=write(job->pipe[1],&ready,1);}while(count<0&&errno==EINTR);return NULL;
}
static void ajobs_cleanup(void){while(ajobs){AJob *job=ajobs;ajobs=job->next;pthread_join(job->thread,NULL);close(job->pipe[0]);close(job->pipe[1]);free(job);}ajob_count=0;}
static int anative_job(void (*run)(void *),void *data){if(ajob_count>=64){afail("RangeError","Native worker queue exceeds 64 jobs.");return 0;}
  AJob *job=(AJob*)amemory(sizeof(*job));job->run=run;job->data=data;if(pipe(job->pipe)){free(job);afail("IOError","Cannot open native worker notification.");return 0;}fcntl(job->pipe[0],F_SETFD,FD_CLOEXEC);fcntl(job->pipe[1],F_SETFD,FD_CLOEXEC);
  pthread_attr_t options;pthread_attr_init(&options);pthread_attr_setstacksize(&options,256*1024);int status=pthread_create(&job->thread,&options,ajob_worker,job);pthread_attr_destroy(&options);if(status){close(job->pipe[0]);close(job->pipe[1]);free(job);afail("Error","Cannot start native worker.");return 0;}
  job->next=ajobs;ajobs=job;ajob_count++;aasync_cleanup_hook=ajobs_cleanup;
  aasync_wait_fd(job->pipe[0],POLLIN,-1);pthread_join(job->thread,NULL);close(job->pipe[0]);close(job->pipe[1]);AJob **link=&ajobs;while(*link&&*link!=job)link=&(*link)->next;if(*link)*link=job->next;free(job);ajob_count--;return 1;
}
